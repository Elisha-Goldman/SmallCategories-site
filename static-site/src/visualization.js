import { drag } from 'd3-drag'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import { select } from 'd3-selection'

let nextVisualizationId = 0
const idealColor = '#0f766e'
const mutedColor = '#9ca3af'
const congruenceColor = classId => `hsl(${Math.round((215 + classId * 137.508) % 360)} 66% 34%)`

function categoryGraph(table, objects, morphisms) {
  const groups = new Map()
  for (let morphism = objects; morphism < morphisms; morphism += 1) {
    const source = Array.from({ length: objects }, (_, object) => object)
      .find(object => table[morphism][object] < morphisms)
    const target = Array.from({ length: objects }, (_, object) => object)
      .find(object => table[object][morphism] < morphisms)
    if (source === undefined || target === undefined) continue
    const key = `${source}-${target}`
    if (!groups.has(key)) groups.set(key, { source, target, members: [] })
    groups.get(key).members.push(morphism)
  }
  return {
    nodes: Array.from({ length: objects }, (_, id) => ({ id })),
    links: [...groups.values()],
  }
}

export function mountCategoryVisualization(element, table, objects, morphisms) {
  if (!element || morphisms === 0 || objects === 0) {
    return { highlight: () => {}, setLabels: () => {}, cleanup: () => {} }
  }

  const { nodes, links } = categoryGraph(table, objects, morphisms)
  const nonEndomorphisms = links.filter(link => link.source !== link.target)
  const endomorphisms = links.filter(link => link.source === link.target)
  const id = `category-quiver-${nextVisualizationId++}`
  const height = 260
  let width = Math.max(320, element.getBoundingClientRect().width)

  const svg = select(element)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Category quiver; object nodes can be dragged')

  svg.append('defs')
    .append('marker')
    .attr('id', `${id}-arrow`)
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 27)
    .attr('refY', 5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto-start-reverse')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', 'context-stroke')

  const link = svg.append('g')
    .attr('class', 'viz-links')
    .selectAll('g')
    .data(nonEndomorphisms)
    .join('g')

  link.append('path')
    .attr('id', (_, index) => `${id}-edge-${index}`)
    .attr('marker-end', `url(#${id}-arrow)`)

  const loop = svg.append('g')
    .attr('class', 'viz-loops')
    .selectAll('g')
    .data(endomorphisms)
    .join('g')

  loop.append('path')
    .attr('id', (_, index) => `${id}-loop-${index}`)
    .attr('marker-end', `url(#${id}-arrow)`)

  for (const [groups, name] of [[link, 'edge'], [loop, 'loop']]) {
    groups.append('text')
      .append('textPath')
      .attr('href', (_, index) => `#${id}-${name}-${index}`)
      .attr('startOffset', '50%')
      .each(function (group) {
        group.members.forEach((morphism, index) => {
          if (index) select(this).append('tspan').text(', ')
          select(this).append('tspan').attr('data-morphism', morphism).text(morphism)
        })
      })
  }

  const node = svg.append('g')
    .attr('class', 'viz-nodes')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('role', 'button')
    .attr('aria-label', node => `Object ${node.id}, identity id_${node.id}; drag to rearrange`)

  node.append('circle').attr('r', 17)
  node.append('text').attr('dy', '0.35em').text(node => node.id)

  function seedPositions() {
    const radius = Math.min(width * 0.3, 100)
    nodes.forEach((node, index) => {
      const angle = objects === 1 ? 0 : -Math.PI / 2 + (2 * Math.PI * index) / objects
      node.x = width / 2 + (objects === 1 ? 0 : radius * Math.cos(angle))
      node.y = height / 2 + (objects === 1 ? 0 : radius * Math.sin(angle))
      node.fx = null
      node.fy = null
    })
  }

  seedPositions()
  const simulation = forceSimulation(nodes)
    .force('link', forceLink(links).id(node => node.id).distance(105).strength(0.08))
    .force('charge', forceManyBody().strength(-180))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collide', forceCollide(28))
    .on('tick', () => {
      for (const item of nodes) {
        item.x = Math.max(30, Math.min(width - 30, item.x))
        item.y = Math.max(48, Math.min(height - 30, item.y))
      }
      link.select('path').attr('d', item => `M${item.source.x},${item.source.y}L${item.target.x},${item.target.y}`)
      loop.select('path').attr('d', item => {
        const x = item.source.x
        const y = item.source.y
        return `M${x - 9},${y - 16}C${x - 46},${y - 67} ${x + 46},${y - 67} ${x + 9},${y - 16}`
      })
      node.attr('transform', item => `translate(${item.x},${item.y})`)
    })

  node.call(drag()
    .on('start', (event, subject) => {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      subject.fx = subject.x
      subject.fy = subject.y
    })
    .on('drag', (event, subject) => {
      subject.fx = Math.max(30, Math.min(width - 30, event.x))
      subject.fy = Math.max(48, Math.min(height - 30, event.y))
    })
    .on('end', (event, subject) => {
      if (!event.active) simulation.alphaTarget(0)
      subject.fx = null
      subject.fy = null
    }))

  const box = element.closest('.viz-box')
  const reset = box?.querySelector('[data-reset-viz]')
  const resetLayout = () => {
    seedPositions()
    simulation.alpha(1).restart()
  }
  reset?.addEventListener('click', resetLayout)

  const highlightBox = box?.querySelector('[data-viz-highlight]')
  const highlightStatus = box?.querySelector('[data-viz-highlight-status]')
  const legend = box?.querySelector('[data-viz-legend]')
  const clear = box?.querySelector('[data-clear-highlight]')
  function highlight(selection) {
    highlightBox.hidden = !selection
    const selectedMorphisms = selection?.kind === 'center' || selection?.kind === 'trace'
      ? new Set(selection.value) : null
    const included = morphism => selection.kind === 'ideal'
      ? Boolean(selection.value & (1 << morphism)) : selectedMorphisms.has(morphism)
    const colors = selection && Array.from({ length: morphisms }, (_, morphism) =>
      selection.kind === 'congruence'
        ? congruenceColor(selection.value[morphism])
        : included(morphism) ? idealColor : mutedColor)
    function colorGroups(groups) {
      groups.each(function (group) {
        const groupColors = group.members.map(morphism => colors?.[morphism])
        const pathColor = groupColors.every(color => color === groupColors[0])
          ? groupColors[0] : '#6b7280'
        select(this).select('path')
          .style('stroke', selection ? pathColor : null)
          .style('stroke-width', selection ? '2.3px' : null)
        select(this).selectAll('tspan[data-morphism]')
          .style('fill', function () { return selection ? colors[Number(this.getAttribute('data-morphism'))] : null })
      })
    }
    colorGroups(link)
    colorGroups(loop)
    node.select('circle').style('fill', item => selection ? colors[item.id] : null)
    node.select('text').style('fill', item =>
      selection && selection.kind !== 'congruence' && !included(item.id) ? '#374151' : null)
    if (!selection) {
      legend.innerHTML = ''
      return
    }
    const prefix = { congruence: 'C', ideal: 'I', center: 'Z', trace: 'T' }[selection.kind]
    const label = `${prefix}${selection.id}`
    if (selection.kind === 'congruence') {
      highlightStatus.textContent = `${label}: morphisms with the same color are identified.`
      const classes = new Map()
      selection.value.forEach((classId, morphism) => {
        if (!classes.has(classId)) classes.set(classId, [])
        classes.get(classId).push(morphism)
      })
      legend.innerHTML = [...classes].map(([classId, members]) =>
        `<span class="viz-legend-item"><span class="viz-swatch" style="background:${congruenceColor(classId)}"></span>{${members.join(', ')}}</span>`).join('')
    } else {
      highlightStatus.textContent = selection.kind === 'center'
        ? `${label}: highlighted morphisms are its components at each object.`
        : selection.kind === 'trace'
          ? `${label}: highlighted endomorphisms share a trace class.`
          : `${label}: highlighted morphisms belong to the ideal.`
      const inside = []
      const outside = []
      for (let morphism = 0; morphism < morphisms; morphism += 1) {
        (included(morphism) ? inside : outside).push(morphism)
      }
      const insideLabel = selection.kind === 'center' ? 'Components'
        : selection.kind === 'trace' ? 'Class' : 'In'
      legend.innerHTML = `<span class="viz-legend-item"><span class="viz-swatch" style="background:${idealColor}"></span>${insideLabel}: ${inside.length ? inside.join(', ') : '∅'}</span>
        <span class="viz-legend-item"><span class="viz-swatch" style="background:${mutedColor}"></span>Out: ${outside.length ? outside.join(', ') : '∅'}</span>`
    }
  }
  const clearHighlight = () => highlight(null)
  clear?.addEventListener('click', clearHighlight)

  function setLabels(labels) {
    svg.selectAll('tspan[data-morphism]')
      .text(function () { return labels[Number(this.getAttribute('data-morphism'))] })
  }

  const observer = new ResizeObserver(entries => {
    const nextWidth = Math.max(320, entries[0].contentRect.width)
    if (Math.abs(nextWidth - width) < 1) return
    width = nextWidth
    svg.attr('viewBox', `0 0 ${width} ${height}`)
    simulation.force('center', forceCenter(width / 2, height / 2)).alpha(0.4).restart()
  })
  observer.observe(element)

  return {
    highlight,
    setLabels,
    cleanup: () => {
      observer.disconnect()
      reset?.removeEventListener('click', resetLayout)
      clear?.removeEventListener('click', clearHighlight)
      simulation.stop()
    },
  }
}
