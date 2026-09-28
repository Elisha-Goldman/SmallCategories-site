import { setTitle } from '../ui.js'
import posetsTemplate from './posets.html'

const COUNTS = { 4: 1, 5: 4, 6: 25, 7: 174, 8: 1481, 9: 14136 }
const SVG_NS = 'http://www.w3.org/2000/svg'

function svgElement(tag, attributes, text) {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
  if (text !== undefined) element.textContent = String(text)
  return element
}

export function coverEdges(permutation) {
  const edges = []
  for (let a = 0; a < permutation.length; a += 1) {
    for (let b = a + 1; b < permutation.length; b += 1) {
      if (permutation[a] >= permutation[b]) continue
      let indirect = false
      for (let c = a + 1; c < b; c += 1) {
        if (permutation[a] < permutation[c] && permutation[c] < permutation[b]) {
          indirect = true
          break
        }
      }
      if (!indirect) edges.push([a, b])
    }
  }
  return edges
}

function validData(data, n) {
  if (!Array.isArray(data) || data.length !== COUNTS[n]) return false
  const expected = Array.from({ length: n }, (_, index) => index + 1).join(',')
  const seen = new Set()
  for (const permutation of data) {
    if (!Array.isArray(permutation) || permutation.length !== n
      || [...permutation].sort((a, b) => a - b).join(',') !== expected) return false
    const key = permutation.join(',')
    if (seen.has(key)) return false
    seen.add(key)
  }
  return true
}

export function renderPosetsPage({ app, isCurrent }) {
  setTitle('Prime posets')
  app.innerHTML = posetsTemplate

  const sizeSelect = app.querySelector('[data-poset-size]')
  const position = app.querySelector('[data-poset-position]')
  const permutationLabel = app.querySelector('[data-poset-permutation]')
  const plotWrap = app.querySelector('.posets-plot-wrap')
  const svg = app.querySelector('[data-poset-plot]')
  const grid = app.querySelector('[data-poset-grid]')
  const covers = app.querySelector('[data-poset-covers]')
  const points = app.querySelector('[data-poset-points]')
  const previous = app.querySelector('[data-poset-prev]')
  const playButton = app.querySelector('[data-poset-play]')
  const next = app.querySelector('[data-poset-next]')
  const seek = app.querySelector('[data-poset-seek]')
  const frameInput = app.querySelector('[data-poset-frame]')
  const speed = app.querySelector('[data-poset-speed]')
  const download = app.querySelector('[data-poset-download]')
  const downloadRow = app.querySelector('[data-poset-download-row]')
  const errorLabel = app.querySelector('[data-poset-error]')
  let size = 7
  let permutations = []
  let index = 0
  let timer = null
  let loadId = 0
  let abortController = null

  function stop() {
    if (timer !== null) clearInterval(timer)
    timer = null
    playButton.textContent = 'Play'
    playButton.setAttribute('aria-pressed', 'false')
    position.setAttribute('aria-live', 'polite')
  }

  function draw() {
    if (!permutations.length) return
    const width = Math.round(plotWrap.getBoundingClientRect().width)
    if (width < 220) return
    const side = width - 80
    const left = 50
    const top = 18
    const bottom = top + side
    const x = rank => left + (rank - 1) * side / (size - 1)
    const y = rank => bottom - (rank - 1) * side / (size - 1)
    const permutation = permutations[index]

    svg.setAttribute('viewBox', `0 0 ${width} ${width}`)
    grid.replaceChildren()
    covers.replaceChildren()
    points.replaceChildren()
    for (let rank = 1; rank <= size; rank += 1) {
      grid.appendChild(svgElement('line', { x1: x(rank), y1: top, x2: x(rank), y2: bottom, class: 'posets-grid-line' }))
      grid.appendChild(svgElement('line', { x1: left, y1: y(rank), x2: left + side, y2: y(rank), class: 'posets-grid-line' }))
      grid.appendChild(svgElement('text', { x: x(rank), y: bottom + 20, 'text-anchor': 'middle', class: 'posets-axis-tick' }, rank))
      grid.appendChild(svgElement('text', { x: left - 17, y: y(rank) + 4, 'text-anchor': 'middle', class: 'posets-axis-tick' }, rank))
    }
    grid.appendChild(svgElement('text', { x: left + side / 2, y: width - 11, 'text-anchor': 'middle', class: 'posets-axis-title' }, 'First linear extension rank'))
    grid.appendChild(svgElement('text', { x: 14, y: top + side / 2,
      transform: `rotate(-90 14 ${top + side / 2})`, 'text-anchor': 'middle', class: 'posets-axis-title' },
    'Second linear extension rank'))

    for (const [a, b] of coverEdges(permutation)) {
      const x1 = x(a + 1), y1 = y(permutation[a])
      const x2 = x(b + 1), y2 = y(permutation[b])
      const inset = 9 / Math.hypot(x2 - x1, y2 - y1)
      covers.appendChild(svgElement('line', {
        x1: x1 + (x2 - x1) * inset, y1: y1 + (y2 - y1) * inset,
        x2: x2 - (x2 - x1) * inset, y2: y2 - (y2 - y1) * inset,
        class: 'posets-cover-line',
      }))
    }
    for (let a = 0; a < size; a += 1) {
      const dot = svgElement('circle', { cx: x(a + 1), cy: y(permutation[a]), r: 8,
        class: 'posets-point' })
      dot.appendChild(svgElement('title', {}, `Element at ranks ${a + 1}, ${permutation[a]}`))
      points.appendChild(dot)
    }
    position.textContent = `Frame ${new Intl.NumberFormat().format(index + 1)} of ${new Intl.NumberFormat().format(permutations.length)}`
    permutationLabel.textContent = `Second-extension ranks, left to right: ${permutation.join('  ')}`
    seek.value = String(index + 1)
    frameInput.value = String(index + 1)
    svg.setAttribute('aria-label', `Poset ${index + 1} of ${permutations.length}; second-extension ranks ${permutation.join(', ')}`)
    previous.disabled = index === 0
    next.disabled = index === permutations.length - 1
  }

  function select(indexToShow) {
    index = Math.max(0, Math.min(permutations.length - 1, indexToShow))
    draw()
  }

  function play() {
    if (timer !== null) { stop(); return }
    if (index === permutations.length - 1) select(0)
    playButton.textContent = 'Pause'
    playButton.setAttribute('aria-pressed', 'true')
    position.setAttribute('aria-live', 'off')
    timer = setInterval(() => {
      if (index === permutations.length - 1) { stop(); return }
      select(index + 1)
    }, Number(speed.value))
  }

  async function loadSize(n) {
    stop()
    abortController?.abort()
    abortController = new AbortController()
    const requestId = ++loadId
    permutations = []
    size = n
    index = 0
    position.textContent = 'Loading embeddings…'
    permutationLabel.textContent = ''
    errorLabel.hidden = true
    downloadRow.hidden = true
    for (const control of [previous, playButton, next, seek, frameInput]) control.disabled = true
    const dataUrl = `/poset-data/v1/n-${n}.json`
    try {
      const response = await fetch(dataUrl, { signal: abortController.signal })
      if (!response.ok) throw new Error(`Could not load the size-${n} data (${response.status}).`)
      const data = await response.json()
      if (!isCurrent() || requestId !== loadId) return
      if (!validData(data, n)) throw new Error(`The size-${n} data did not pass validation.`)
      permutations = data
      seek.max = String(data.length)
      frameInput.max = String(data.length)
      for (const control of [seek, frameInput]) control.disabled = false
      playButton.disabled = data.length < 2
      download.href = dataUrl
      download.download = `prime-posets-dimension-2-size-${n}.json`
      downloadRow.hidden = false
      draw()
      const url = new URL(window.location.href)
      url.searchParams.set('n', String(n))
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    } catch (error) {
      if (error.name === 'AbortError' || !isCurrent() || requestId !== loadId) return
      position.textContent = 'Could not load embeddings'
      errorLabel.textContent = error.message
      errorLabel.hidden = false
    }
  }

  const requested = Number(new URLSearchParams(window.location.search).get('n'))
  size = Object.hasOwn(COUNTS, requested) ? requested : 7
  sizeSelect.value = String(size)
  sizeSelect.addEventListener('change', () => loadSize(Number(sizeSelect.value)))
  previous.addEventListener('click', () => { stop(); select(index - 1) })
  next.addEventListener('click', () => { stop(); select(index + 1) })
  playButton.addEventListener('click', play)
  seek.addEventListener('input', () => { stop(); select(Number(seek.value) - 1) })
  frameInput.addEventListener('change', () => { stop(); select(Number(frameInput.value) - 1) })
  speed.addEventListener('change', () => { if (timer !== null) { stop(); play() } })
  const observer = new ResizeObserver(draw)
  observer.observe(plotWrap)
  loadSize(size)
  return () => {
    stop()
    abortController?.abort()
    observer.disconnect()
  }
}
