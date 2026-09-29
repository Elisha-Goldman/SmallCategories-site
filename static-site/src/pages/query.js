import {
  categoryHref,
  categoryLabel,
  getCategoryMetadata,
  getPropositionBitmap,
  bitmapHas,
  getManifest,
  getPropositions,
  findCell,
  loadCategory,
  lookupCandidates,
} from '../data.js'
import { completePresentation, isomorphicTables, parsePresentation, tableSignature } from '../presentation.js'
import { presentationQueryKeys } from '../category-query-presentation.js'
import { escapeHtml, iconText, numberFormat, setTitle } from '../ui.js'
import queryTemplate from './query.html'

function boundValue(formData, name, fallback) {
  const raw = String(formData.get(name) || '').trim()
  if (raw === '') return fallback
  const value = Number(raw)
  return Number.isInteger(value) ? value : NaN
}

async function renderQueryResults(app, manifest, propositions, bounds, truePropBits, falsePropBits, isLatest) {
  const cells = manifest.cells.filter(cell =>
    cell.morphisms >= bounds.morphismsLb &&
    cell.morphisms <= bounds.morphismsUb &&
    cell.objects >= bounds.objectsLb &&
    cell.objects <= bounds.objectsUb)
  const propositionBits = new Set(propositions.map(proposition => proposition.bit))
  const selected = [...truePropBits, ...falsePropBits].map(Number)
  if (selected.some(bit => !propositionBits.has(bit))) throw new Error('The query contains an unknown proposition')
  const wanted = truePropBits.map(Number).map(bit => ({ bit, value: true }))
    .concat(falsePropBits.map(Number).map(bit => ({ bit, value: false })))

  let count = 0
  const rows = []
  for (const cell of cells) {
    // A cell where some chosen proposition is uniformly wrong contributes
    // nothing, and is ruled out from the manifest without any request at all.
    if (wanted.some(({ bit, value }) =>
      cell.trueCounts[bit] === (value ? 0 : cell.count))) continue
    const undecided = wanted.filter(({ bit }) =>
      cell.trueCounts[bit] !== 0 && cell.trueCounts[bit] !== cell.count)
    if (undecided.length === 0) {
      // Every chosen proposition is uniformly right: the whole cell matches.
      count += cell.count
      for (let index = 0; index < cell.count && rows.length < 10; index += 1) {
        rows.push({ ...cell, index })
      }
      continue
    }
    const bitmaps = await Promise.all(undecided.map(({ bit }) => getPropositionBitmap(cell, bit)))
    if (!isLatest()) return
    for (let index = 0; index < cell.count; index += 1) {
      if (!undecided.every(({ value }, position) => bitmapHas(bitmaps[position], index) === value)) continue
      count += 1
      if (rows.length < 10) rows.push({ ...cell, index })
    }
  }

  const namedRows = await Promise.all(rows.map(async row => ({
    ...row,
    metadata: await getCategoryMetadata(row, row.index),
  })))
  if (!isLatest()) return
  app.querySelector('#query-results').innerHTML = `<div class="box">
    ${count === 0 ? '<p>No categories matched.</p>' : `<div class="table-wrap"><table><thead><tr><th>${iconText('link', 'ID')}</th><th>Name</th></tr></thead><tbody>
      ${namedRows.map(row => `<tr><td><a href="${categoryHref(row.morphisms, row.objects, row.index)}" data-link>${categoryLabel(row.morphisms, row.objects, row.index)}</a></td><td class="${row.metadata?.friendlyName ? '' : 'muted'}">${escapeHtml(row.metadata?.friendlyName || 'N/A')}</td></tr>`).join('')}
    </tbody></table></div><p class="help">Showing ${numberFormat.format(rows.length)} of ${numberFormat.format(count)} results.</p>`}
  </div>`
}

export async function renderQueryPage({ app, isCurrent, onError }) {
  const [manifest, propositions] = await Promise.all([getManifest(), getPropositions()])
  if (!isCurrent()) return

  setTitle('Query')
  app.innerHTML = queryTemplate
  const propositionContainer = app.querySelector('[data-query-propositions]')
  propositionContainer.innerHTML = propositions.length > 0
    ? `<div class="grid two">
        <fieldset><legend>Satisfying</legend><div class="checkboxes">${propositions.map(proposition => `<label><input type="checkbox" name="true_prop" value="${proposition.bit}"> ${escapeHtml(proposition.name)}</label>`).join('')}</div></fieldset>
        <fieldset><legend>Not satisfying</legend><div class="checkboxes">${propositions.map(proposition => `<label><input type="checkbox" name="false_prop" value="${proposition.bit}"> ${escapeHtml(proposition.name)}</label>`).join('')}</div></fieldset>
      </div>`
    : '<div class="notification is-info is-light">This build supports numeric queries only because it contains no proposition data.</div>'

  let submissionGeneration = 0
  app.querySelector('#query-form').addEventListener('submit', async event => {
    event.preventDefault()
    const submission = ++submissionGeneration
    const isLatest = () => isCurrent() && submission === submissionGeneration
    const formData = new FormData(event.currentTarget)
    const bounds = {
      morphismsLb: boundValue(formData, 'morphisms_lb', 0),
      morphismsUb: boundValue(formData, 'morphisms_ub', Number.MAX_SAFE_INTEGER),
      objectsLb: boundValue(formData, 'objects_lb', 0),
      objectsUb: boundValue(formData, 'objects_ub', Number.MAX_SAFE_INTEGER),
    }
    if (Object.values(bounds).some(Number.isNaN)) {
      app.querySelector('#query-results').innerHTML = '<div class="notification is-danger is-light">Bounds must be whole numbers.</div>'
      return
    }
    const trueProps = formData.getAll('true_prop')
    const falseProps = formData.getAll('false_prop')
    try {
      await renderQueryResults(app, manifest, propositions, bounds, trueProps, falseProps, isLatest)
    } catch (error) {
      if (isLatest()) onError(error)
    }
  })

  let presentationGeneration = 0
  app.querySelector('#presentation-form').addEventListener('submit', async event => {
    event.preventDefault()
    const submission = ++presentationGeneration
    const isLatest = () => isCurrent() && submission === presentationGeneration
    const results = app.querySelector('#presentation-results')
    const form = new FormData(event.currentTarget)
    results.innerHTML = '<p class="loading">Resolving presentation…</p>'
    // Yield before a potentially substantial finite completion.
    await new Promise(resolve => setTimeout(resolve, 0))
    if (!isLatest()) return
    try {
      const presentation = parsePresentation({
        objects: form.get('objects'),
        generators: form.get('generators'),
        relations: form.get('relations'),
      })
      const category = completePresentation(presentation)
      const cell = findCell(manifest, category.morphisms, category.objects)
      if (!cell) {
        results.innerHTML = `<div class="box">The presentation has ${category.morphisms} morphisms and ${category.objects} objects. This size is not in the database.</div>`
        return
      }
      results.innerHTML = '<p class="loading">Searching the database…</p>'
      const candidates = await lookupCandidates(cell, tableSignature(category.table, category.objects))
      for (const index of candidates) {
        const stored = await loadCategory(cell, index)
        if (!isLatest()) return
        if (!isomorphicTables(category.table, stored.table, category.objects)) continue
        const metadata = await getCategoryMetadata(cell, index)
        if (!isLatest()) return
        const presentationQuery = new URLSearchParams({
          [presentationQueryKeys.objects]: String(form.get('objects') || ''),
          [presentationQueryKeys.generators]: String(form.get('generators') || ''),
          [presentationQueryKeys.relations]: String(form.get('relations') || ''),
        })
        const href = `${categoryHref(cell.morphisms, cell.objects, index)}?${presentationQuery}`
        results.innerHTML = `<div class="box"><p>Found <a href="${escapeHtml(href)}" data-link>${categoryLabel(cell.morphisms, cell.objects, index)}</a>${metadata?.friendlyName ? ` — ${escapeHtml(metadata.friendlyName)}` : ''}.</p></div>`
        return
      }
      if (isLatest()) results.innerHTML = `<div class="box">The presentation has ${category.morphisms} morphisms and ${category.objects} objects, but no matching category was found in this build.</div>`
    } catch (error) {
      if (isLatest()) results.innerHTML = `<div class="notification is-danger is-light">${escapeHtml(error.message || error)}</div>`
    }
  })
}
