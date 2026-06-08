import { describe, expect, it } from 'vitest'
import { parseTemplateFillValues } from './pdfTemplateFillImport'

describe('parseTemplateFillValues', () => {
  it('lee valores desde un JSON plano por nombre de casillero', () => {
    expect(parseTemplateFillValues('{"paciente":"Camila","edad":31}')).toEqual({
      paciente: 'Camila',
      edad: '31',
    })
  })

  it('lee valores desde un paquete JSON con propiedad values', () => {
    expect(
      parseTemplateFillValues(
        JSON.stringify({ values: { paciente: 'Camila', aprobado: true } }),
      ),
    ).toEqual({
      paciente: 'Camila',
      aprobado: true,
    })
  })

  it('lee CSV en formato name,value con comillas y comas', () => {
    expect(
      parseTemplateFillValues('name,value\npaciente,"Concha, Camila"\nrut,12.345'),
    ).toEqual({
      paciente: 'Concha, Camila',
      rut: '12.345',
    })
  })

  it('lee CSV de una fila de encabezados y una fila de datos', () => {
    expect(parseTemplateFillValues('paciente,rut\nCamila,12.345')).toEqual({
      paciente: 'Camila',
      rut: '12.345',
    })
  })

  it('rechaza archivos sin pares de variable y valor', () => {
    expect(() => parseTemplateFillValues('solo-un-texto-suelto')).toThrow(
      /No se encontraron datos/i,
    )
  })
})
