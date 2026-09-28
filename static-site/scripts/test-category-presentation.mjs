import assert from 'node:assert/strict'
import { completePresentation, parsePresentation } from '../src/presentation.js'
import { generatorWords, presentationRelations, suggestedGenerators } from '../src/category-presentation.js'

function category(objects, generators = '', relations = '') {
  return completePresentation(parsePresentation({ objects, generators, relations }))
}

const empty = category('')
assert.deepEqual(suggestedGenerators(empty.table, empty.objects), [])
assert.deepEqual(generatorWords(empty.table, empty.objects, []), [])

const discrete = category('x y')
assert.deepEqual(suggestedGenerators(discrete.table, discrete.objects), [])
assert.deepEqual(generatorWords(discrete.table, discrete.objects, []), [[], []])

const arrow = category('x y', 'f: x -> y')
assert.deepEqual(suggestedGenerators(arrow.table, arrow.objects), [2])
assert.deepEqual(generatorWords(arrow.table, arrow.objects, [2]), [[], [], [2]])
assert.deepEqual(presentationRelations(arrow.table, [2], generatorWords(arrow.table, arrow.objects, [2])), [])

const cyclic = category('x', 'a: x -> x', 'a a a = id_x')
assert.deepEqual(suggestedGenerators(cyclic.table, cyclic.objects), [1])
assert.deepEqual(generatorWords(cyclic.table, cyclic.objects, [1]), [[], [1], [1, 1]])
assert.deepEqual(presentationRelations(cyclic.table, [1], generatorWords(cyclic.table, cyclic.objects, [1])), [
  { left: [1, 1, 1], right: [], product: 0 },
])

const dihedral = category('x', 'r: x -> x\ns: x -> x',
  'r r r = id_x\ns s = id_x\ns r = r r s')
const generators = suggestedGenerators(dihedral.table, dihedral.objects)
assert.deepEqual(generators, [1, 2])
const words = generatorWords(dihedral.table, dihedral.objects, generators)
assert.ok(words.every(word => word !== null))
assert.ok(generatorWords(dihedral.table, dihedral.objects, [1]).some(word => word === null))
for (let morphism = 0; morphism < dihedral.morphisms; morphism += 1) {
  const evaluate = word => word.reduce((result, generator) => dihedral.table[generator][result], 0)
  assert.equal(evaluate(words[morphism]), morphism)
}
for (const { left, right, product } of presentationRelations(dihedral.table, generators, words)) {
  const evaluate = word => word.reduce((result, generator) => dihedral.table[generator][result], 0)
  assert.equal(evaluate(left), product)
  assert.equal(evaluate(right), product)
}

const groupoid = category('x y', 'f: x -> y\ng: y -> x',
  'f g = id_x\ng f = id_y')
assert.deepEqual(suggestedGenerators(groupoid.table, groupoid.objects), [2, 3])
assert.deepEqual(generatorWords(groupoid.table, groupoid.objects, [2, 3]), [[], [], [2], [3]])

console.log('Category presentation tests passed.')
