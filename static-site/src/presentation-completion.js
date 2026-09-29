// A terminating, confluent word-rewriting system gives exact normal forms for
// the presented category. Words are ordered by length, then generator index.
function compareWords(left, right) {
  if (left.length !== right.length) return left.length - right.length
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function wordKey(word) {
  return word.join(',')
}

function pathKey(source, word) {
  return `${source}:${wordKey(word)}`
}

function replace(word, position, length, replacement) {
  return [...word.slice(0, position), ...replacement, ...word.slice(position + length)]
}

function reduce(word, rules, maxSteps) {
  let result = word
  let steps = 0
  while (true) {
    let replacement = null
    for (let position = 0; position < result.length && !replacement; position += 1) {
      for (const rule of rules) {
        if (position + rule.left.length > result.length) continue
        if (!rule.left.every((generator, offset) => generator === result[position + offset])) continue
        replacement = replace(result, position, rule.left.length, rule.right)
        break
      }
    }
    if (!replacement) return result
    result = replacement
    if (++steps > maxSteps) throw new Error(`This presentation needs more than ${maxSteps} reductions to resolve.`)
  }
}

// If left-hand sides overlap, reducing either occurrence must give the same
// normal form. Disjoint reductions commute, so they need no critical pair.
function criticalPairs(first, second) {
  const pairs = []
  for (let shift = 1 - second.left.length; shift < first.left.length; shift += 1) {
    const start = Math.min(0, shift)
    const end = Math.max(first.left.length, shift + second.left.length)
    const word = new Array(end - start)
    let compatible = true
    for (let index = 0; index < first.left.length; index += 1) {
      word[index - start] = first.left[index]
    }
    for (let index = 0; index < second.left.length; index += 1) {
      const position = shift + index - start
      if (word[position] !== undefined && word[position] !== second.left[index]) {
        compatible = false
        break
      }
      word[position] = second.left[index]
    }
    if (!compatible) continue
    pairs.push([
      replace(word, -start, first.left.length, first.right),
      replace(word, shift - start, second.left.length, second.right),
    ])
  }
  return pairs
}

function completeRules(presentation, maxPaths, maxLength) {
  const rules = []
  const equations = presentation.relations.map(({ left, right }) => [left.word, right.word])
  let next = 0
  while (next < equations.length) {
    if (equations.length > maxPaths) {
      throw new Error(`This presentation needs more than ${maxPaths} relation checks to resolve.`)
    }
    const [left, right] = equations[next++].map(word => reduce(word, rules, maxPaths))
    const order = compareWords(left, right)
    if (order === 0) continue
    const rule = order > 0 ? { left, right } : { left: right, right: left }
    if (rule.left.length > maxLength + 1) {
      throw new Error(`This presentation did not resolve within path length ${maxLength}. It may describe an infinite category.`)
    }
    for (const existing of rules) {
      equations.push(...criticalPairs(rule, existing), ...criticalPairs(existing, rule))
    }
    equations.push(...criticalPairs(rule, rule))
    rules.push(rule)
  }
  return rules
}

export function completeFinitePresentation(presentation, { maxPaths = 12000, maxLength = 16, includeDetails = false } = {}) {
  const rules = completeRules(presentation, maxPaths, maxLength)
  const morphisms = presentation.objects.map((_, source) => ({ source, target: source, word: [] }))
  const indexOf = new Map(morphisms.map((path, index) => [pathKey(path.source, path.word), index]))

  for (let index = 0; index < morphisms.length; index += 1) {
    const path = morphisms[index]
    for (let generator = 0; generator < presentation.generators.length; generator += 1) {
      const edge = presentation.generators[generator]
      if (path.target !== edge.source) continue
      const word = reduce([...path.word, generator], rules, maxPaths)
      const key = pathKey(path.source, word)
      if (indexOf.has(key)) continue
      if (word.length > maxLength) {
        throw new Error(`This presentation did not resolve within path length ${maxLength}. It may describe an infinite category.`)
      }
      if (morphisms.length >= maxPaths) {
        throw new Error(`This presentation needs more than ${maxPaths} paths to resolve. Try a shorter presentation or add relations.`)
      }
      indexOf.set(key, morphisms.length)
      morphisms.push({ source: path.source, target: edge.target, word })
    }
  }

  const count = morphisms.length
  const table = morphisms.map(row => morphisms.map(col => {
    if (col.target !== row.source) return count
    const normal = reduce([...col.word, ...row.word], rules, maxPaths)
    const result = indexOf.get(pathKey(col.source, normal))
    if (result === undefined) throw new Error('Could not compose paths in the presentation.')
    return result
  }))
  const result = { objects: presentation.objects.length, morphisms: count, table }
  if (includeDetails) {
    result.generatorMorphisms = presentation.generators.map((edge, generator) =>
      indexOf.get(pathKey(edge.source, reduce([generator], rules, maxPaths))))
  }
  return result
}
