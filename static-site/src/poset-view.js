function members(mask, morphisms) {
  const values = []
  for (let index = 0; index < morphisms; index += 1) {
    if (mask & (1 << index)) values.push(index)
  }
  return values.length ? `{${values.join(', ')}}` : '∅'
}

function classes(partition) {
  const groups = new Map()
  partition.forEach((label, morphism) => {
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(morphism)
  })
  return `{${[...groups.values()].map(group => `{${group.join(', ')}}`).join(', ')}}`
}

function nodeMarkup(node, position, label, description, selected) {
  const name = `${label}${node.id}`
  const radiusX = Math.max(16, name.length * 3.5 + 5)
  return `<g class="poset-node${selected ? ' is-selected' : ''}" data-poset-node="${node.id}" tabindex="0" role="button" aria-label="${name}: ${description}">
    <title>${name}: ${description}</title>
    <ellipse cx="${position.x}" cy="${position.y}" rx="${radiusX}" ry="16"></ellipse>
    <text x="${position.x}" y="${position.y + 4}">${name}</text>
  </g>`
}

function fullDiagram(poset, label, describe, selected) {
  const maxRank = Math.max(0, ...poset.nodes.map(node => node.rank))
  const layers = Array.from({ length: maxRank + 1 }, () => [])
  poset.nodes.forEach(node => layers[node.rank].push(node))
  const width = Math.max(320, Math.max(...layers.map(layer => layer.length)) * 66 + 48)
  const height = (maxRank + 1) * 68 + 24
  const positions = new Map()
  layers.forEach((layer, rank) => layer.forEach((node, index) => {
    positions.set(node.id, {
      x: width / 2 + (index - (layer.length - 1) / 2) * 66,
      y: 46 + (maxRank - rank) * 68,
    })
  }))
  const edges = poset.covers.map(([lower, upper]) => {
    const from = positions.get(lower)
    const to = positions.get(upper)
    return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>`
  }).join('')
  const nodes = poset.nodes.map(node => nodeMarkup(node, positions.get(node.id), label,
    describe(node.value), node.id === selected)).join('')
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${label} Hasse diagram">
    <g class="poset-edges">${edges}</g><g>${nodes}</g>
  </svg>`
}

function localDiagram(poset, label, describe, selected, lower, upper) {
  const width = Math.max(320, Math.max(lower.length, upper.length) * 66 + 48)
  const height = 238
  const positions = new Map([[selected, { x: width / 2, y: 119 }]])
  lower.forEach((id, index) => positions.set(id, {
    x: width / 2 + (index - (lower.length - 1) / 2) * 66, y: 206,
  }))
  upper.forEach((id, index) => positions.set(id, {
    x: width / 2 + (index - (upper.length - 1) / 2) * 66, y: 32,
  }))
  const edges = [
    ...lower.map(id => `<line x1="${positions.get(id).x}" y1="206" x2="${width / 2}" y2="119"></line>`),
    ...upper.map(id => `<line x1="${width / 2}" y1="119" x2="${positions.get(id).x}" y2="32"></line>`),
  ].join('')
  const ids = [...upper, selected, ...lower]
  const nodes = ids.map(id => nodeMarkup(poset.nodes[id], positions.get(id), label,
    describe(poset.nodes[id].value), id === selected)).join('')
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${label} Hasse neighborhood">
    <g class="poset-edges">${edges}</g><g>${nodes}</g>
  </svg>`
}

export function mountPoset(element, poset, { kind, morphisms }) {
  const label = kind === 'congruence' ? 'C' : 'I'
  const describe = kind === 'congruence'
    ? classes
    : mask => members(mask, morphisms)
  const order = kind === 'congruence' ? 'refinement' : 'inclusion'
  const rankMeaning = kind === 'congruence'
    ? 'Rank counts class mergers from equality.'
    : 'Rank counts morphisms in the ideal.'
  const full = poset.nodes.length <= 120
  const lower = Array.from({ length: poset.nodes.length }, () => [])
  const upper = Array.from({ length: poset.nodes.length }, () => [])
  poset.covers.forEach(([a, b]) => {
    upper[a].push(b)
    lower[b].push(a)
  })
  const ranks = new Map()
  poset.nodes.forEach(node => ranks.set(node.rank, (ranks.get(node.rank) || 0) + 1))
  element.innerHTML = `<p class="help">${poset.nodes.length.toLocaleString()} ${poset.nodes.length === 1 ? 'element' : 'elements'}, ${poset.covers.length.toLocaleString()} ${poset.covers.length === 1 ? 'cover relation' : 'cover relations'}. Ordered by ${order}. ${rankMeaning} Select a node to inspect it.</p>
    ${full ? '' : `<p class="help">The full diagram is large. This view shows the selected element and its immediate neighbors.</p>
      <p class="poset-ranks help">${[...ranks].map(([rank, count]) => `Rank ${rank}: ${count.toLocaleString()}`).join(' · ')}</p>
      <p class="poset-jumps"><button class="button is-small is-light" type="button" data-poset-jump="0">Bottom</button>
      <button class="button is-small is-light" type="button" data-poset-jump="${poset.nodes.length - 1}">Top</button></p>`}
    <div class="poset-scroll" data-poset-diagram></div>
    <p class="poset-detail" data-poset-detail></p>`
  const diagram = element.querySelector('[data-poset-diagram]')
  const detail = element.querySelector('[data-poset-detail]')
  let selected = 0
  function select(id) {
    selected = id
    const node = poset.nodes[id]
    if (full) {
      element.querySelector('.poset-node.is-selected')?.classList.remove('is-selected')
      element.querySelector(`[data-poset-node="${id}"]`)?.classList.add('is-selected')
    } else {
      diagram.innerHTML = localDiagram(poset, label, describe, id, lower[id], upper[id])
      diagram.scrollLeft = Math.max(0, (diagram.scrollWidth - diagram.clientWidth) / 2)
    }
    detail.textContent = `${label}${id} = ${describe(node.value)}. Rank ${node.rank}. ` +
      `${lower[id].length} immediate lower, ${upper[id].length} immediate upper.`
  }
  if (full) {
    diagram.innerHTML = fullDiagram(poset, label, describe, selected)
    diagram.scrollLeft = Math.max(0, (diagram.scrollWidth - diagram.clientWidth) / 2)
  }
  select(0)
  element.addEventListener('click', event => {
    const jump = event.target.closest('[data-poset-jump]')
    if (jump && element.contains(jump)) {
      select(Number(jump.dataset.posetJump))
      return
    }
    const target = event.target.closest('[data-poset-node]')
    if (target && element.contains(target)) select(Number(target.dataset.posetNode))
  })
  element.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target.closest('[data-poset-node]')
    if (!target || !element.contains(target)) return
    event.preventDefault()
    select(Number(target.dataset.posetNode))
  })
}
