import assert from 'node:assert/strict'
import { congruencePoset, idealPoset } from '../src/posets.js'
import { completePresentation, parsePresentation } from '../src/presentation.js'

function category(objects, generators = '', relations = '') {
  return completePresentation(parsePresentation({ objects, generators, relations }))
}

function sizes(value) {
  return [value.nodes.length, value.covers.length]
}

const empty = category('')
assert.deepEqual(sizes(congruencePoset(empty.table, empty.objects)), [1, 0])
assert.deepEqual(sizes(idealPoset(empty.table)), [1, 0])

const terminal = category('x')
assert.deepEqual(sizes(congruencePoset(terminal.table, terminal.objects)), [1, 0])
assert.deepEqual(sizes(idealPoset(terminal.table)), [2, 1])

const discrete = category('x y')
assert.deepEqual(sizes(congruencePoset(discrete.table, discrete.objects)), [1, 0])
assert.deepEqual(sizes(idealPoset(discrete.table)), [4, 4])

const largeDiscrete = category(Array.from({ length: 15 }, (_, index) => `x${index}`).join(' '))
assert.deepEqual(sizes(congruencePoset(largeDiscrete.table, largeDiscrete.objects)), [1, 0])
assert.deepEqual(sizes(idealPoset(largeDiscrete.table)), [32768, 245760])

const arrow = category('x y', 'f: x -> y')
assert.deepEqual(sizes(congruencePoset(arrow.table, arrow.objects)), [1, 0])
assert.deepEqual(sizes(idealPoset(arrow.table)), [5, 5])

const idempotent = category('x', 'a: x -> x', 'a a = a')
assert.deepEqual(sizes(congruencePoset(idempotent.table, idempotent.objects)), [2, 1])
assert.deepEqual(sizes(idealPoset(idempotent.table)), [3, 2])

const group = category('x', 'a: x -> x', 'a a = id_x')
assert.deepEqual(sizes(congruencePoset(group.table, group.objects)), [2, 1])
assert.deepEqual(sizes(idealPoset(group.table)), [2, 1])

const parallel = category('x y z', 'f: x -> y\ng: x -> y\nh: y -> z')
const congruences = congruencePoset(parallel.table, parallel.objects)
assert.deepEqual(sizes(congruences), [3, 2])
assert.deepEqual(congruences.nodes.map(node => node.rank), [0, 1, 2])
for (const { value } of congruences.nodes) {
  for (let left = 0; left < parallel.morphisms; left += 1) {
    for (let right = left + 1; right < parallel.morphisms; right += 1) {
      if (value[left] !== value[right]) continue
      for (let other = 0; other < parallel.morphisms; other += 1) {
        const afterLeft = parallel.table[other][left]
        const afterRight = parallel.table[other][right]
        if (afterLeft < parallel.morphisms) assert.equal(value[afterLeft], value[afterRight])
        const beforeLeft = parallel.table[left][other]
        const beforeRight = parallel.table[right][other]
        if (beforeLeft < parallel.morphisms) assert.equal(value[beforeLeft], value[beforeRight])
      }
    }
  }
}

for (const { value: mask } of idealPoset(parallel.table).nodes) {
  for (let morphism = 0; morphism < parallel.morphisms; morphism += 1) {
    if (!(mask & (1 << morphism))) continue
    for (let other = 0; other < parallel.morphisms; other += 1) {
      for (const composite of [parallel.table[morphism][other], parallel.table[other][morphism]]) {
        if (composite < parallel.morphisms) assert.ok(mask & (1 << composite))
      }
    }
  }
}

console.log('Category poset tests passed.')
