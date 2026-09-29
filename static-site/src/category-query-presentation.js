import { completePresentation, isomorphismMapping, parsePresentation } from './presentation.js'

export const presentationQueryKeys = {
  objects: 'presentation_objects',
  generators: 'presentation_generators',
  relations: 'presentation_relations',
}

export function presentationFromQuery(raw, table, objects) {
  const parsed = parsePresentation(raw)
  const completed = completePresentation(parsed, { includeDetails: true })
  if (completed.objects !== objects || completed.morphisms !== table.length) return null
  const mapping = isomorphismMapping(completed.table, table, objects)
  if (!mapping) return null

  const objectNames = Array(objects)
  parsed.objects.forEach((name, object) => { objectNames[mapping[object]] = name })
  const generators = []
  const seen = new Set()
  parsed.generators.forEach((generator, index) => {
    const morphism = mapping[completed.generatorMorphisms[index]]
    if (morphism < objects || seen.has(morphism)) return
    seen.add(morphism)
    generators.push({ morphism, name: generator.name })
  })
  return {
    objectNames,
    generators,
    raw,
    redundantGenerators: parsed.generators.length - generators.length,
  }
}
