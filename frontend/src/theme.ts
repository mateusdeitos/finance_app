import { createTheme, type MantineColorsTuple } from '@mantine/core'

const blue: MantineColorsTuple = [
  '#e9f7ff',
  '#dbeaf3',
  '#bad2e1',
  '#95b8cf',
  '#77a3bf',
  '#6295b6',
  '#568fb3',
  '#457b9d',
  '#396e8e',
  '#265f7f',
]

const green: MantineColorsTuple = [
  '#e8fcfa',
  '#daf5f2',
  '#b4e9e3',
  '#8cddd3',
  '#6bd3c6',
  '#56cdbe',
  '#49caba',
  '#39b2a3',
  '#2a9d8f',
  '#0c8a7d',
]

const red: MantineColorsTuple = [
  '#ffe9ec',
  '#ffd3d6',
  '#f6a6ac',
  '#ef757e',
  '#e84c58',
  '#e63946',
  '#e42332',
  '#cb1425',
  '#b60c20',
  '#a00019',
]

const yellow: MantineColorsTuple = [
  '#fff2e3',
  '#ffe4cf',
  '#f9c8a1',
  '#f4a261',
  '#f19044',
  '#ef8029',
  '#ef7819',
  '#d5660c',
  '#be5906',
  '#a64b00',
]

const grey: MantineColorsTuple = [
  '#f5f5f5',
  '#e7e7e7',
  '#cdcdcd',
  '#b2b2b2',
  '#9a9a9a',
  '#8b8b8b',
  '#848484',
  '#717171',
  '#656565',
  '#1a1a1a',
]

export const theme = createTheme({
  colors: { blue, green, red, yellow, grey },
})
