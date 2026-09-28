// The multiplication table uses row ∘ col. Identities occupy 0..objects-1.
function endpoints(table, objects) {
  return table.map((_, morphism) => {
    let source = -1
    let target = -1
    for (let object = 0; object < objects; object += 1) {
      if (table[morphism][object] === morphism) source = object
      if (table[object][morphism] === morphism) target = object
    }
    if (source < 0 || target < 0) throw new Error('The category table has a morphism without endpoints.')
    return { source, target }
  })
}

export function categoryCenter(table, objects) {
  const arrows = endpoints(table, objects)
  const endomorphisms = Array.from({ length: objects }, () => [])
  arrows.forEach(({ source, target }, morphism) => {
    if (source === target) endomorphisms[source].push(morphism)
  })

  const elements = []
  const components = []
  function visit(object) {
    if (object === objects) {
      elements.push([...components])
      return
    }
    for (const candidate of endomorphisms[object]) {
      components[object] = candidate
      const natural = arrows.every(({ source, target }, morphism) =>
        source > object || target > object ||
        table[morphism][components[source]] === table[components[target]][morphism])
      if (natural) visit(object + 1)
    }
  }
  visit(0)

  const index = new Map(elements.map((element, id) => [element.join(','), id]))
  const multiplication = elements.map(left => elements.map(right =>
    index.get(left.map((morphism, object) => table[morphism][right[object]]).join(','))))
  return { elements, multiplication }
}

export function categoryTrace(table, objects) {
  const n = table.length
  const arrows = endpoints(table, objects)
  const parent = Array.from({ length: n }, (_, morphism) => morphism)
  const find = morphism => {
    while (parent[morphism] !== morphism) morphism = parent[morphism] = parent[parent[morphism]]
    return morphism
  }
  for (let left = 0; left < n; left += 1) {
    for (let right = 0; right < n; right += 1) {
      const forward = table[left][right]
      const backward = table[right][left]
      if (forward < n && backward < n) parent[find(forward)] = find(backward)
    }
  }
  const classes = new Map()
  arrows.forEach(({ source, target }, morphism) => {
    if (source !== target) return
    const root = find(morphism)
    if (!classes.has(root)) classes.set(root, [])
    classes.get(root).push(morphism)
  })
  return [...classes.values()].sort((left, right) => left[0] - right[0])
}
