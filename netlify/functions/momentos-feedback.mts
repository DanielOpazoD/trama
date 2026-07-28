import type { Config, Context } from '@netlify/functions'
import { z } from 'zod'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { getSql, sqlTyped, type SqlClient } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { runWithSystemRls } from './_lib/user-rls.js'
import { parseJsonBody } from './_lib/zod-body.js'

const CommentBody = z.object({
  body: z.string().trim().min(1).max(500),
})

const ReactionBody = z.object({
  reaction: z.literal('heart').default('heart'),
})

type AccessRow = {
  owner_user_id: string
  access_role: 'owner' | 'viewer' | 'editor' | null
}

type CommentRow = {
  id: string
  momento_id: string
  author_user_id: string
  author_display_name: string | null
  author_email: string | null
  body: string
  can_delete: boolean
  created_at: string
  updated_at: string
}

type ReactionRow = {
  reaction: 'heart'
  count: number | string
  reacted_by_me: boolean
}

type DeletedRow = { id: string }

function commentFromRow(row: CommentRow) {
  return {
    id: row.id,
    momentoId: row.momento_id,
    authorUserId: row.author_user_id,
    authorDisplayName: row.author_display_name ?? undefined,
    authorEmail: row.author_email ?? undefined,
    body: row.body,
    canDelete: Boolean(row.can_delete),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function reactionFromRow(row: ReactionRow) {
  return {
    reaction: row.reaction,
    count: Number(row.count),
    reactedByMe: Boolean(row.reacted_by_me),
  }
}

async function loadMomentoAccess(sql: SqlClient, userId: string, momentoId: string) {
  const rows = await runWithSystemRls(() =>
    sqlTyped<AccessRow>(sql`
    SELECT m.user_id AS owner_user_id,
           CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role
    FROM momentos m
    LEFT JOIN momento_space_access msa
      ON msa.owner_user_id = m.user_id
     AND msa.member_user_id = ${userId}
     AND msa.deleted_at IS NULL
    WHERE m.id = ${momentoId}
      AND m.deleted_at IS NULL
      AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
  `),
  )
  return rows[0] ?? null
}

async function listComments(sql: SqlClient, userId: string, momentoId: string) {
  const rows = await runWithSystemRls(() =>
    sqlTyped<CommentRow>(sql`
    SELECT c.id, c.momento_id, c.user_id AS author_user_id,
           author.display_name AS author_display_name,
           author.email AS author_email,
           c.body,
           (c.user_id = ${userId} OR m.user_id = ${userId}) AS can_delete,
           c.created_at, c.updated_at
    FROM momento_comments c
    JOIN momentos m ON m.id = c.momento_id
    LEFT JOIN users author ON author.id = c.user_id
    WHERE c.momento_id = ${momentoId}
      AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC, c.id ASC
  `),
  )
  return rows.map(commentFromRow)
}

async function listReactions(sql: SqlClient, userId: string, momentoId: string) {
  const rows = await runWithSystemRls(() =>
    sqlTyped<ReactionRow>(sql`
    SELECT reaction,
           COUNT(*)::int AS count,
           BOOL_OR(user_id = ${userId}) AS reacted_by_me
    FROM momento_reactions
    WHERE momento_id = ${momentoId}
      AND deleted_at IS NULL
    GROUP BY reaction
    ORDER BY reaction ASC
  `),
  )
  return rows.map(reactionFromRow)
}

async function feedbackPayload(sql: SqlClient, userId: string, momentoId: string) {
  const [comments, reactions] = await Promise.all([
    listComments(sql, userId, momentoId),
    listReactions(sql, userId, momentoId),
  ])
  return { comments, reactions }
}

export default withObservability(
  'momentos-feedback',
  async (req: Request, context: Context, { requestId }) => {
    const sql = getSql()
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const momentoId = context.params.momentoId

    if (!momentoId) {
      return ApiErrors.notFound(requestId, 'Momento no encontrado')
    }

    const access = await loadMomentoAccess(sql, userId, momentoId)
    if (!access) {
      return ApiErrors.notFound(requestId, 'Momento no encontrado')
    }

    if (req.method === 'GET') {
      return Response.json(await feedbackPayload(sql, userId, momentoId))
    }

    if (req.method === 'POST') {
      const parsed = await parseJsonBody(req, CommentBody, requestId)
      if (!parsed.ok) return parsed.response
      await ensureUserRow(sql, authedUser)

      const rows = await runWithSystemRls(() =>
        sqlTyped<CommentRow>(sql`
        WITH ins AS (
          INSERT INTO momento_comments (momento_id, user_id, body)
          VALUES (${momentoId}, ${userId}, ${parsed.data.body})
          RETURNING id, momento_id, user_id, body, created_at, updated_at
        )
        SELECT ins.id, ins.momento_id, ins.user_id AS author_user_id,
               author.display_name AS author_display_name,
               author.email AS author_email,
               ins.body,
               TRUE AS can_delete,
               ins.created_at, ins.updated_at
        FROM ins
        LEFT JOIN users author ON author.id = ins.user_id
      `),
      )
      const comment = rows[0]
      if (!comment) {
        return ApiErrors.internal(requestId, 'No se pudo comentar el Momento')
      }
      return Response.json({ comment: commentFromRow(comment) }, { status: 201 })
    }

    if (req.method === 'PUT') {
      const parsed = await parseJsonBody(req, ReactionBody, requestId)
      if (!parsed.ok) return parsed.response
      await ensureUserRow(sql, authedUser)

      await runWithSystemRls(
        () => sql`
        WITH revived AS (
          UPDATE momento_reactions
          SET deleted_at = NULL,
              updated_at = NOW()
          WHERE momento_id = ${momentoId}
            AND user_id = ${userId}
            AND reaction = ${parsed.data.reaction}
          RETURNING id
        )
        INSERT INTO momento_reactions (momento_id, user_id, reaction)
        SELECT ${momentoId}, ${userId}, ${parsed.data.reaction}
        WHERE NOT EXISTS (SELECT 1 FROM revived)
      `,
      )
      const reactions = await listReactions(sql, userId, momentoId)
      const reaction = reactions.find((r) => r.reaction === parsed.data.reaction) ?? {
        reaction: parsed.data.reaction,
        count: 0,
        reactedByMe: true,
      }
      return Response.json({ reaction })
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url)
      const reaction = url.searchParams.get('reaction')
      const commentId = url.searchParams.get('commentId')

      if (reaction === 'heart') {
        const rows = await runWithSystemRls(() =>
          sqlTyped<DeletedRow>(sql`
          UPDATE momento_reactions
          SET deleted_at = NOW(),
              updated_at = NOW()
          WHERE momento_id = ${momentoId}
            AND user_id = ${userId}
            AND reaction = ${reaction}
            AND deleted_at IS NULL
          RETURNING id
        `),
        )
        if (!rows[0]) {
          return ApiErrors.notFound(requestId, 'Reacción no encontrada')
        }
        return Response.json({ reaction: { reaction, reactedByMe: false } })
      }

      if (commentId) {
        const rows = await runWithSystemRls(() =>
          sqlTyped<DeletedRow>(sql`
          UPDATE momento_comments c
          SET deleted_at = NOW(),
              updated_at = NOW()
          FROM momentos m
          WHERE c.id = ${commentId}
            AND c.momento_id = ${momentoId}
            AND c.momento_id = m.id
            AND c.deleted_at IS NULL
            AND m.deleted_at IS NULL
            AND (c.user_id = ${userId} OR m.user_id = ${userId})
          RETURNING c.id
        `),
        )
        if (!rows[0]) {
          return ApiErrors.notFound(requestId, 'Comentario no encontrado')
        }
        return Response.json({ deleted: true })
      }

      return ApiErrors.validation(requestId, 'Indica reaction o commentId')
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/momentos-feedback/:momentoId'],
}
