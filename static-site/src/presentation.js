// Paths are written in traversal order: "f g" means first f, then g.
const identifier = /^[A-Za-z][A-Za-z0-9_]*$/

function fail(message) {
  throw new Error(message)
}

export function parsePresentation({ objects: objectText, generators: generatorText, relations: relationText }) {
  const objects = String(objectText).trim().split(/[\s,]+/).filter(Boolean)
  const objectIds = new Map()
  for (const name of objects) {
    if (!identifier.test(name) || objectIds.has(name)) fail(`Invalid or repeated object name: ${name}`)
    objectIds.set(name, objectIds.size)
  }

  const generators = []
  const generatorIds = new Map()
  for (const [lineNumber, line] of String(generatorText).split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s*->\s*([A-Za-z][A-Za-z0-9_]*)\s*$/.exec(line)
    if (!match) fail(`Generator line ${lineNumber + 1}: use “f: x -> y”.`)
    const [, name, sourceName, targetName] = match
    if (name.startsWith('id_') || generatorIds.has(name)) fail(`Invalid or repeated generator name: ${name}`)
    if (!objectIds.has(sourceName) || !objectIds.has(targetName)) fail(`Generator ${name} uses an unknown object.`)
    generatorIds.set(name, generators.length)
    generators.push({ name, source: objectIds.get(sourceName), target: objectIds.get(targetName) })
  }

  function parsePath(text, lineNumber) {
    const tokens = text.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 1 && tokens[0].startsWith('id_')) {
      const object = objectIds.get(tokens[0].slice(3))
      if (object === undefined) fail(`Relation line ${lineNumber}: unknown identity ${tokens[0]}.`)
      return { word: [], source: object, target: object }
    }
    if (!tokens.length) fail(`Relation line ${lineNumber}: a path is missing.`)
    const word = tokens.map(token => {
      if (!generatorIds.has(token)) fail(`Relation line ${lineNumber}: unknown generator ${token}.`)
      return generatorIds.get(token)
    })
    for (let i = 1; i < word.length; i += 1) {
      if (generators[word[i - 1]].target !== generators[word[i]].source) {
        fail(`Relation line ${lineNumber}: ${tokens[i - 1]} and ${tokens[i]} do not compose.`)
      }
    }
    return { word, source: generators[word[0]].source, target: generators[word.at(-1)].target }
  }

  const relations = []
  for (const [lineNumber, line] of String(relationText).split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const parts = line.split('=')
    if (parts.length !== 2) fail(`Relation line ${lineNumber + 1}: use one “=”.`)
    const left = parsePath(parts[0], lineNumber + 1)
    const right = parsePath(parts[1], lineNumber + 1)
    if (left.source !== right.source || left.target !== right.target) {
      fail(`Relation line ${lineNumber + 1}: both paths must have the same source and target.`)
    }
    relations.push({ left, right })
  }
  return { objects, generators, relations }
}

function pathKey(source, word) {
  return word.length ? word.join(',') : `@${source}`
}

function enumeratePaths(presentation, maxLength, maxPaths) {
  const paths = presentation.objects.map((_, source) => ({ word: [], source, target: source, boundaries: [source] }))
  const byKey = new Map(paths.map((path, index) => [pathKey(path.source, path.word), index]))
  for (let index = 0; index < paths.length; index += 1) {
    const path = paths[index]
    if (path.word.length === maxLength) continue
    for (let generator = 0; generator < presentation.generators.length; generator += 1) {
      const edge = presentation.generators[generator]
      if (edge.source !== path.target) continue
      const word = [...path.word, generator]
      const next = { word, source: path.source, target: edge.target, boundaries: [...path.boundaries, edge.target] }
      byKey.set(pathKey(next.source, word), paths.length)
      paths.push(next)
      if (paths.length > maxPaths) fail(`This presentation needs more than ${maxPaths} paths to resolve. Try a shorter presentation or add relations.`)
    }
  }
  return { paths, byKey }
}

function equivalentPaths(presentation, paths, byKey) {
  const parent = paths.map((_, index) => index)
  const find = index => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]]
      index = parent[index]
    }
    return index
  }
  const join = (left, right) => { parent[find(left)] = find(right) }
  for (const [index, path] of paths.entries()) {
    for (const relation of presentation.relations) {
      for (const [from, to] of [[relation.left, relation.right], [relation.right, relation.left]]) {
        for (let position = 0; position <= path.word.length - from.word.length; position += 1) {
          if (path.boundaries[position] !== from.source || path.boundaries[position + from.word.length] !== from.target) continue
          if (!from.word.every((generator, offset) => generator === path.word[position + offset])) continue
          const replacement = [...path.word.slice(0, position), ...to.word, ...path.word.slice(position + from.word.length)]
          const other = byKey.get(pathKey(path.source, replacement))
          if (other !== undefined) join(index, other)
        }
      }
    }
  }
  return find
}

// The search stops only when every path of length L+1 is provably equal to a
// shorter path. Then induction reduces *every* longer path, so the result is
// the presented category itself rather than a finite quotient of it.
export function completePresentation(presentation, { maxPaths = 12000, maxLength = 16 } = {}) {
  const minimum = Math.max(0, ...presentation.relations.flatMap(relation =>
    [relation.left.word.length - 1, relation.right.word.length - 1]))
  for (let length = minimum; length <= maxLength; length += 1) {
    const { paths, byKey } = enumeratePaths(presentation, length + 1, maxPaths)
    const find = equivalentPaths(presentation, paths, byKey)
    const representatives = new Map()
    for (let index = 0; index < paths.length; index += 1) {
      if (paths[index].word.length <= length && !representatives.has(find(index))) {
        representatives.set(find(index), index)
      }
    }
    if (paths.some((path, index) => path.word.length === length + 1 && !representatives.has(find(index)))) continue
    // A bounded equality is not yet a congruence if appending a generator to
    // two equal short paths separates them. Both sides must be stable.
    const transitions = new Map()
    let congruent = true
    for (let index = 0; index < paths.length && congruent; index += 1) {
      const path = paths[index]
      if (path.word.length > length) continue
      for (let generator = 0; generator < presentation.generators.length; generator += 1) {
        const edge = presentation.generators[generator]
        for (const [side, applicable, word, source] of [
          ['right', edge.source === path.target, [...path.word, generator], path.source],
          ['left', edge.target === path.source, [generator, ...path.word], edge.source],
        ]) {
          if (!applicable) continue
          const result = find(byKey.get(pathKey(source, word)))
          const key = `${find(index)}:${generator}:${side}`
          if (transitions.has(key) && transitions.get(key) !== result) {
            congruent = false
            break
          }
          transitions.set(key, result)
        }
        if (!congruent) break
      }
    }
    if (!congruent) continue

    const identityRoots = presentation.objects.map((_, object) => find(byKey.get(pathKey(object, []))))
    const roots = [...identityRoots, ...[...representatives.keys()].filter(root => !identityRoots.includes(root))]
    const morphismOfRoot = new Map(roots.map((root, index) => [root, index]))
    const transition = (morphism, generator) => {
      const representative = paths[representatives.get(roots[morphism])]
      const next = byKey.get(pathKey(representative.source, [...representative.word, generator]))
      if (next === undefined) fail('Could not compose paths in the presentation.')
      return morphismOfRoot.get(find(next))
    }
    const morphisms = roots.map(root => paths[representatives.get(root)])
    const count = roots.length
    const table = Array.from({ length: count }, (_, row) =>
      Array.from({ length: count }, (_, col) => {
        if (morphisms[col].target !== morphisms[row].source) return count
        return morphisms[row].word.reduce(transition, col)
      }))
    return { objects: presentation.objects.length, morphisms: count, table }
  }
  fail(`This presentation did not resolve within path length ${maxLength}. It may describe an infinite category.`)
}

function endpoints(table, objects) {
  return table.map((_, morphism) => ({
    source: Array.from({ length: objects }, (_, index) => index).find(index => table[morphism][index] === morphism),
    target: Array.from({ length: objects }, (_, index) => index).find(index => table[index][morphism] === morphism),
  }))
}

function elementSignature(table, index) {
  const n = table.length
  const rowCounts = new Uint8Array(n + 1)
  const columnCounts = new Uint8Array(n + 1)
  let leftFixed = 0
  let rightFixed = 0
  let commuting = 0
  for (let other = 0; other < n; other += 1) {
    const rowValue = table[index][other]
    const columnValue = table[other][index]
    rowCounts[rowValue] += 1
    columnCounts[columnValue] += 1
    if (rowValue === index) leftFixed += 1
    if (columnValue === index) rightFixed += 1
    if (rowValue === columnValue) commuting += 1
  }
  const rowFrequencies = new Uint8Array(n + 1)
  const columnFrequencies = new Uint8Array(n + 1)
  for (let value = 0; value <= n; value += 1) {
    if (rowCounts[value]) rowFrequencies[rowCounts[value]] += 1
    if (columnCounts[value]) columnFrequencies[columnCounts[value]] += 1
  }
  let hash = 2166136261
  const add = value => { hash = Math.imul(hash ^ value, 16777619) }
  add(table[index][index] === index ? 1 : 0)
  add(leftFixed)
  add(rightFixed)
  add(commuting)
  for (let frequency = 1; frequency <= n; frequency += 1) {
    add(rowFrequencies[frequency])
    add(columnFrequencies[frequency])
  }
  return hash >>> 0
}

// Label-independent, cheap filter. Collisions are harmless: isomorphicTables
// checks each surviving candidate exactly.
export function tableSignature(table, objects) {
  const signatures = table.map((_, index) => elementSignature(table, index)).sort((a, b) => a - b)
  let hash = Math.imul(2166136261 ^ objects, 16777619)
  for (const signature of signatures) hash = Math.imul(hash ^ signature, 16777619)
  return hash >>> 0
}

export function isomorphicTables(left, right, objects) {
  const n = left.length
  if (right.length !== n) return false
  const leftEnds = endpoints(left, objects)
  const rightEnds = endpoints(right, objects)
  const leftFeatures = left.map((_, index) => elementSignature(left, index))
  const rightFeatures = right.map((_, index) => elementSignature(right, index))
  const mapping = new Array(n).fill(-1)
  const reverse = new Array(n).fill(-1)

  function compatible(source, target) {
    if (leftFeatures[source] !== rightFeatures[target]) return false
    if ((source < objects) !== (target < objects)) return false
    const sourceEnd = leftEnds[source]
    const targetEnd = rightEnds[target]
    if (sourceEnd.source === undefined || sourceEnd.target === undefined || targetEnd.source === undefined || targetEnd.target === undefined) return false
    if (mapping[sourceEnd.source] !== -1 && mapping[sourceEnd.source] !== targetEnd.source) return false
    if (mapping[sourceEnd.target] !== -1 && mapping[sourceEnd.target] !== targetEnd.target) return false
    if (source >= objects && (mapping[sourceEnd.source] === -1 || mapping[sourceEnd.target] === -1)) return false
    for (let other = 0; other < n; other += 1) {
      if (mapping[other] === -1) continue
      for (const [a, b, x, y] of [[source, other, target, mapping[other]], [other, source, mapping[other], target]]) {
        const product = left[a][b]
        const candidate = right[x][y]
        if ((product === n) !== (candidate === n)) return false
        if (product < n && mapping[product] !== -1 && mapping[product] !== candidate) return false
        if (product < n && reverse[candidate] !== -1 && reverse[candidate] !== product) return false
      }
    }
    return true
  }

  function search(index) {
    if (index === n) {
      for (let row = 0; row < n; row += 1) {
        for (let col = 0; col < n; col += 1) {
          if ((left[row][col] === n ? n : mapping[left[row][col]]) !== right[mapping[row]][mapping[col]]) return false
        }
      }
      return true
    }
    for (let candidate = 0; candidate < n; candidate += 1) {
      if (reverse[candidate] !== -1 || !compatible(index, candidate)) continue
      mapping[index] = candidate
      reverse[candidate] = index
      if (search(index + 1)) return true
      mapping[index] = -1
      reverse[candidate] = -1
    }
    return false
  }
  return search(0)
}
