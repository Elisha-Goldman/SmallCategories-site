import assert from 'node:assert/strict'
import { completePresentation, isomorphicTables, parsePresentation, tableSignature } from '../src/presentation.js'

function resolve(objects, generators = '', relations = '') {
  return completePresentation(parsePresentation({ objects, generators, relations }))
}

function assertAssociative({ table, morphisms }) {
  for (let first = 0; first < morphisms; first += 1) {
    for (let second = 0; second < morphisms; second += 1) {
      for (let third = 0; third < morphisms; third += 1) {
        const left = table[first][second] < morphisms ? table[table[first][second]][third] : morphisms
        const right = table[second][third] < morphisms ? table[first][table[second][third]] : morphisms
        assert.equal(left, right)
      }
    }
  }
}

assert.deepEqual(resolve('x'), { objects: 1, morphisms: 1, table: [[0]] })
assert.deepEqual(resolve(''), { objects: 0, morphisms: 0, table: [] })
assert.equal(resolve('x y').morphisms, 2)

const arrow = resolve('x y', 'f: x -> y')
assert.equal(arrow.morphisms, 3)
assert.equal(arrow.table[2][0], 2)
assert.equal(arrow.table[1][2], 2)
assert.equal(arrow.table[2][2], 3)
const swappedObjects = [1, 0, 2]
const swappedArrow = arrow.table.map((_, row) =>
  arrow.table.map((_, col) => {
    const product = arrow.table[swappedObjects[row]][swappedObjects[col]]
    return product === 3 ? 3 : swappedObjects.indexOf(product)
  }))
assert.equal(tableSignature(arrow.table, 2), tableSignature(swappedArrow, 2))
assert.equal(isomorphicTables(arrow.table, swappedArrow, 2), true)

const triangle = resolve('x y z', 'f: x -> y\ng: y -> z\nh: x -> z', 'f g = h')
assert.equal(triangle.morphisms, 6)
assert.equal(triangle.table[5][3], 4)

const twoObjectGroupoid = resolve('x y', 'f: x -> y\ng: y -> x',
  'f g = id_x\ng f = id_y')
assert.equal(twoObjectGroupoid.morphisms, 4)
assertAssociative(twoObjectGroupoid)

const idempotent = resolve('x', 'a: x -> x', 'a a = a')
assert.deepEqual(idempotent.table, [[0, 1], [1, 1]])
const involution = resolve('x', 'a: x -> x', 'a a = id_x')
assert.deepEqual(involution.table, [[0, 1], [1, 0]])
assert.equal(isomorphicTables(idempotent.table, involution.table, 1), false)
assert.equal(resolve('x', 'a: x -> x', 'a a a = id_x').morphisms, 3)

// Paths are in traversal order. These relations present D3, the nonabelian
// dihedral group of order six, even though one relation lengthens a word.
const dihedral = resolve('x', 'r: x -> x\ns: x -> x',
  'r r r = id_x\ns s = id_x\ns r = r r s')
assert.equal(dihedral.morphisms, 6)
assertAssociative(dihedral)
const product = (left, right) => dihedral.table[left][right]
const r = 1
const s = 2
assert.equal(product(product(r, r), r), 0)
assert.equal(product(s, s), 0)
assert.equal(product(r, s), product(s, product(r, r)))
assert.notEqual(product(r, s), product(s, r))
for (let element = 0; element < dihedral.morphisms; element += 1) {
  assert.ok(dihedral.table[element].some((value, inverse) =>
    value === 0 && dihedral.table[inverse][element] === 0))
}
assert.equal(resolve('x', 'r: x -> x\ns: x -> x',
  'r r r = id_x\ns s = id_x\ns r s = r r').morphisms, 6)
const squareSymmetries = resolve('x', 'r: x -> x\ns: x -> x',
  'r r r r = id_x\ns s = id_x\ns r = r r r s')
assert.equal(squareSymmetries.morphisms, 8)
assertAssociative(squareSymmetries)

const semilattice = resolve('x', 'a: x -> x\nb: x -> x', 'a a = a\nb b = b\na b = b a')
assert.equal(semilattice.morphisms, 4)
assert.equal(tableSignature(semilattice.table, 1), tableSignature(semilattice.table, 1))

const permutation = [0, 2, 1, 3]
const relabelled = semilattice.table.map((_, newRow) =>
  semilattice.table.map((_, newCol) => {
    const product = semilattice.table[permutation[newRow]][permutation[newCol]]
    return product === 4 ? 4 : permutation.indexOf(product)
  }))
assert.equal(tableSignature(semilattice.table, 1), tableSignature(relabelled, 1))
assert.equal(isomorphicTables(semilattice.table, relabelled, 1), true)

assert.throws(() => resolve('x y', 'f: x -> y\ng: x -> y', 'f g = f'), /do not compose/)
assert.throws(() => resolve('x y', 'f: x -> y', 'f = id_x'), /same source and target/)
assert.throws(() => completePresentation(parsePresentation({ objects: 'x', generators: 'a: x -> x', relations: '' }),
  { maxPaths: 20, maxLength: 5 }), /more than 20 paths|did not resolve/)

console.log('Presentation tests passed.')
