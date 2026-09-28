import { escapeHtml } from './ui.js'

const generatorName = /^[A-Za-z][A-Za-z0-9_]*$/
const letters = 'abcdefghijklmnopqrstuvwxyz'

// A breadth-first traversal gives a shortest generator word for every reached
// morphism. Words use traversal order, the same convention as the Query page.
export function generatorWords(table, objects, generators) {
  const n = table.length
  const words = Array(n).fill(null)
  const queue = []
  for (let object = 0; object < objects; object += 1) {
    words[object] = []
    queue.push(object)
  }
  for (let index = 0; index < queue.length; index += 1) {
    const morphism = queue[index]
    for (const generator of generators) {
      const product = table[generator][morphism]
      if (product >= n || words[product] !== null) continue
      words[product] = [...words[morphism], generator]
      queue.push(product)
    }
  }
  return words
}

// Database categories have at most 15 morphisms, so an exact search for a
// smallest generating set is cheap and gives a stable suggestion.
export function suggestedGenerators(table, objects) {
  const candidates = Array.from({ length: table.length - objects }, (_, index) => objects + index)
  function choose(start, remaining, selected) {
    if (remaining === 0) {
      return generatorWords(table, objects, selected).every(word => word !== null) ? [...selected] : null
    }
    for (let index = start; index <= candidates.length - remaining; index += 1) {
      selected.push(candidates[index])
      const found = choose(index + 1, remaining - 1, selected)
      if (found) return found
      selected.pop()
    }
    return null
  }
  for (let size = 0; size <= candidates.length; size += 1) {
    const found = choose(0, size, [])
    if (found) return found
  }
  throw new Error('Could not find generators for the category.')
}

// Right-extension relations suffice: any generator word can be reduced one
// letter at a time to the displayed representative of its morphism.
export function presentationRelations(table, generators, words) {
  const relations = []
  for (let morphism = 0; morphism < table.length; morphism += 1) {
    for (const generator of generators) {
      const product = table[generator][morphism]
      if (product >= table.length) continue
      const left = [...words[morphism], generator]
      const right = words[product]
      if (left.length === right.length && left.every((item, index) => item === right[index])) continue
      relations.push({ left, right, product })
    }
  }
  return relations
}

function defaultName(index) {
  return index < letters.length ? letters[index] : `g_${index + 1}`
}

function matrixHtml(table, labels) {
  const n = table.length
  return `<div class="table-wrap"><table class="matrix"><tbody>
    <tr><th><i>row</i> ∘ <i>col</i></th>${labels.map((label, id) => `<th title="Morphism ${id}">${label}</th>`).join('')}</tr>
    ${table.map((row, rowId) => `<tr><th title="Morphism ${rowId}">${labels[rowId]}</th>${row.map(value =>
      `<td${value < n ? ` title="Morphism ${value}"` : ''}>${value < n ? labels[value] : '<span class="undefined">/</span>'}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`
}

export function mountCategoryPresentation(element, table, objects, onLabelsChange = () => {}) {
  const n = table.length
  if (n === 0) {
    element.innerHTML = '<p>The empty category has no morphisms or multiplication table.</p>'
    return
  }

  const suggested = suggestedGenerators(table, objects)
  const suggestedNames = new Map(suggested.map((morphism, index) => [morphism, defaultName(index)]))
  const nonidentities = Array.from({ length: n - objects }, (_, index) => objects + index)
  const endpoints = table.map((_, morphism) => ({
    source: Array.from({ length: objects }, (_, object) => object).find(object => table[morphism][object] === morphism),
    target: Array.from({ length: objects }, (_, object) => object).find(object => table[object][morphism] === morphism),
  }))
  const rawLabels = Array.from({ length: n }, (_, morphism) => String(morphism))
  element.innerHTML = `<p class="help">${nonidentities.length ? 'Words are read left to right: <code>a b</code> means first a, then b. ' : 'Every morphism is an identity. '}The table entry is row ∘ column.</p>
    <p class="presentation-generators" data-generator-summary></p>
    ${nonidentities.length ? `<details class="presentation-details"><summary>Edit generators and names</summary>
      <form data-generator-form>
        <p class="help">Choose morphisms that generate the category. Names must be distinct letters or identifiers.</p>
        <div class="table-wrap"><table class="table is-fullwidth"><thead><tr><th>Morphism</th><th>Generator</th><th>Name</th></tr></thead><tbody>
          ${nonidentities.map(morphism => `<tr><th>${morphism}${objects > 1 ? `<span class="help">${endpoints[morphism].source} → ${endpoints[morphism].target}</span>` : ''}</th><td><input type="checkbox" data-generator-check="${morphism}" aria-label="Use morphism ${morphism} as a generator"${suggestedNames.has(morphism) ? ' checked' : ''}></td><td><input class="input is-small presentation-name" type="text" data-generator-name="${morphism}" aria-label="Name for morphism ${morphism}" spellcheck="false" value="${suggestedNames.get(morphism) || ''}"${suggestedNames.has(morphism) ? '' : ' disabled'}></td></tr>`).join('')}
        </tbody></table></div>
        <div class="presentation-actions"><button class="button is-small is-primary" type="submit">Apply</button><button class="button is-small is-light" type="button" data-reset-generators>Reset suggestion</button></div>
        <p class="help" data-generator-message role="status" aria-live="polite"></p>
      </form>
    </details>` : ''}
    <div class="morphism-key" data-morphism-key></div>
    <div data-readable-table></div>
    ${table.some(row => row.some(value => value >= n)) ? '<p class="help">“/” indicates an undefined composition.</p>' : ''}
    <details class="presentation-details"><summary>Raw numbered table</summary>${matrixHtml(table, rawLabels)}</details>
    <details class="presentation-details" data-presentation-relations><summary data-relation-count></summary><div data-relation-list></div></details>`

  const form = element.querySelector('[data-generator-form]')
  const message = element.querySelector('[data-generator-message]')
  function render(generators, names) {
    const words = generatorWords(table, objects, generators)
    const textLabels = words.map((word, morphism) => morphism < objects
      ? `id_${morphism}` : word.map(generator => names.get(generator)).join(' '))
    const htmlLabels = words.map((_, morphism) => morphism < objects
      ? `id<sub>${morphism}</sub>` : escapeHtml(textLabels[morphism]))
    element.querySelector('[data-generator-summary]').innerHTML = generators.length
      ? `Generators: ${generators.map(morphism => `<code>${escapeHtml(names.get(morphism))}</code> = ${morphism}${objects > 1 ? ` (${endpoints[morphism].source} → ${endpoints[morphism].target})` : ''}`).join(', ')}.`
      : 'No nonidentity generators are needed.'
    element.querySelector('[data-morphism-key]').innerHTML = words.map((_, morphism) =>
      `<span class="morphism-key-item">${morphism} = <code>${htmlLabels[morphism]}</code></span>`).join('')
    element.querySelector('[data-readable-table]').innerHTML = matrixHtml(table, htmlLabels)
    const relations = presentationRelations(table, generators, words)
    element.querySelector('[data-relation-count]').textContent = `Relations (${relations.length})`
    element.querySelector('[data-relation-list]').innerHTML = relations.length
      ? `<ul class="presentation-relations">${relations.map(({ left, right, product }) =>
        `<li><code>${escapeHtml(left.map(generator => names.get(generator)).join(' '))}</code> = <code>${right.length ? escapeHtml(right.map(generator => names.get(generator)).join(' ')) : `id<sub>${product}</sub>`}</code></li>`).join('')}</ul>`
      : '<p class="help">No nontrivial relations are needed.</p>'
    onLabelsChange(Array.from({ length: n }, (_, morphism) =>
      names.get(morphism) || String(morphism)))
  }

  function fillForm(generators, names) {
    for (const morphism of nonidentities) {
      const checked = generators.includes(morphism)
      form.querySelector(`[data-generator-check="${morphism}"]`).checked = checked
      const input = form.querySelector(`[data-generator-name="${morphism}"]`)
      input.value = checked ? names.get(morphism) : ''
      input.disabled = !checked
    }
  }

  form?.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-generator-check]')
    if (!checkbox) return
    const morphism = Number(checkbox.dataset.generatorCheck)
    const input = form.querySelector(`[data-generator-name="${morphism}"]`)
    input.disabled = !checkbox.checked
    if (checkbox.checked && !input.value) {
      const used = new Set([...form.querySelectorAll('[data-generator-name]:not(:disabled)')].map(item => item.value.trim()))
      let index = 0
      while (used.has(defaultName(index))) index += 1
      input.value = defaultName(index)
    }
  })
  form?.addEventListener('submit', event => {
    event.preventDefault()
    const generators = nonidentities.filter(morphism =>
      form.querySelector(`[data-generator-check="${morphism}"]`).checked)
    const names = new Map(generators.map(morphism =>
      [morphism, form.querySelector(`[data-generator-name="${morphism}"]`).value.trim()]))
    const values = [...names.values()]
    if (values.some(name => !generatorName.test(name) || name.startsWith('id_'))) {
      message.textContent = 'Use nonempty letter-based names; names beginning with id_ are reserved for identities.'
      return
    }
    if (new Set(values).size !== values.length) {
      message.textContent = 'Generator names must be distinct.'
      return
    }
    const words = generatorWords(table, objects, generators)
    const missing = words.flatMap((word, morphism) => word === null ? [morphism] : [])
    if (missing.length) {
      message.textContent = `These generators do not reach morphism${missing.length === 1 ? '' : 's'} ${missing.join(', ')}.`
      return
    }
    render(generators, names)
    message.textContent = 'Presentation updated.'
  })
  form?.querySelector('[data-reset-generators]').addEventListener('click', () => {
    fillForm(suggested, suggestedNames)
    render(suggested, suggestedNames)
    message.textContent = 'Suggested generators restored.'
  })
  render(suggested, suggestedNames)
}
