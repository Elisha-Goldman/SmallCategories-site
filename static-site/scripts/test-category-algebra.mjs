import assert from 'node:assert/strict'
import { categoryCenter, categoryTrace } from '../src/category-algebra.js'
import { completePresentation, parsePresentation } from '../src/presentation.js'

function category(objects, generators = '', relations = '') {
  return completePresentation(parsePresentation({ objects, generators, relations }))
}

function checkCenter(center) {
  for (let left = 0; left < center.elements.length; left += 1) {
    for (let right = 0; right < center.elements.length; right += 1) {
      assert.equal(center.multiplication[left][right], center.multiplication[right][left])
    }
  }
}

const empty = category('')
assert.deepEqual(categoryCenter(empty.table, empty.objects), {
  elements: [[]], multiplication: [[0]],
})
assert.deepEqual(categoryTrace(empty.table, empty.objects), [])

const discrete = category('x y')
assert.deepEqual(categoryCenter(discrete.table, discrete.objects).elements, [[0, 1]])
assert.deepEqual(categoryTrace(discrete.table, discrete.objects), [[0], [1]])

const arrow = category('x y', 'f: x -> y')
assert.deepEqual(categoryCenter(arrow.table, arrow.objects).elements, [[0, 1]])
assert.deepEqual(categoryTrace(arrow.table, arrow.objects), [[0], [1]])

const idempotent = category('x', 'a: x -> x', 'a a = a')
assert.deepEqual(categoryCenter(idempotent.table, idempotent.objects), {
  elements: [[0], [1]], multiplication: [[0, 1], [1, 1]],
})
assert.deepEqual(categoryTrace(idempotent.table, idempotent.objects), [[0], [1]])

const group = category('x', 'a: x -> x', 'a a = id_x')
assert.deepEqual(categoryCenter(group.table, group.objects), {
  elements: [[0], [1]], multiplication: [[0, 1], [1, 0]],
})
assert.deepEqual(categoryTrace(group.table, group.objects), [[0], [1]])

// Naturality across x -> y excludes a, even though a commutes with every endomorphism of x.
const constrained = category('x y', 'a: x -> x\nf: x -> y\ng: x -> y',
  'a a = a\na f = g\na g = g')
assert.deepEqual(categoryCenter(constrained.table, constrained.objects).elements, [[0, 1]])
assert.deepEqual(categoryTrace(constrained.table, constrained.objects), [[0], [1], [2]])

// The two constants in this noncommutative transformation monoid have the same trace.
const transformations = [
  [0, 1, 2, 3],
  [1, 0, 3, 2],
  [2, 2, 2, 2],
  [3, 3, 3, 3],
]
assert.deepEqual(categoryCenter(transformations, 1).elements, [[0]])
assert.deepEqual(categoryTrace(transformations, 1), [[0], [1], [2, 3]])

// Isomorphisms identify the identity endomorphisms at their two objects.
const isomorphicObjects = [
  [0, 4, 4, 3],
  [4, 1, 2, 4],
  [2, 4, 4, 1],
  [4, 3, 0, 4],
]
assert.deepEqual(categoryCenter(isomorphicObjects, 2).elements, [[0, 1]])
assert.deepEqual(categoryTrace(isomorphicObjects, 2), [[0, 1]])

for (const { table, objects } of [empty, discrete, arrow, idempotent, group, constrained]) {
  checkCenter(categoryCenter(table, objects))
}
checkCenter(categoryCenter(transformations, 1))
checkCenter(categoryCenter(isomorphicObjects, 2))

console.log('Category center and trace tests passed.')
