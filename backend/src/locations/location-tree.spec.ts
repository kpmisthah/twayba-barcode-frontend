import { buildPaths, shortPath, sortSiblings, withDescendants } from './location-tree.js';

const node = (id: string, name: string, parentId: string | null = null, sortOrder = 0) => ({
  id,
  name,
  parentId,
  sortOrder,
});

const tree = [
  node('site', 'Hamrun Shop'),
  node('floor', 'Top', 'site'),
  node('room', 'Room 1', 'floor'),
  node('shelf', 'Shelf A', 'room'),
  node('a10', 'A10', 'shelf'),
  node('a2', 'A2', 'shelf'),
  node('a1', 'A1', 'shelf'),
  node('other', 'Naxxar Garage'),
];

describe('location tree', () => {
  it('builds full paths from the site down', () => {
    const paths = buildPaths(tree);
    expect(paths.get('a2')).toEqual(['Hamrun Shop', 'Top', 'Room 1', 'Shelf A', 'A2']);
    expect(paths.get('site')).toEqual(['Hamrun Shop']);
  });

  it('does not loop forever on a cycle', () => {
    const paths = buildPaths([node('x', 'X', 'y'), node('y', 'Y', 'x')]);
    expect(paths.get('x')?.at(-1)).toBe('X');
  });

  it('sorts spaces naturally (A2 before A10)', () => {
    const names = sortSiblings(tree.filter((n) => n.parentId === 'shelf')).map((n) => n.name);
    expect(names).toEqual(['A1', 'A2', 'A10']);
  });

  it('respects sortOrder before name', () => {
    const names = sortSiblings([node('b', 'B', null, 0), node('a', 'A', null, 1)]).map((n) => n.name);
    expect(names).toEqual(['B', 'A']);
  });

  it('expands to descendants, parents first, without duplicates', () => {
    const ids = withDescendants(tree, ['room', 'a1']).map((n) => n.id);
    expect(ids).toEqual(['room', 'shelf', 'a1', 'a2', 'a10']);
  });

  it('keeps the nearest ancestors that fit', () => {
    const ancestors = ['Hamrun Shop', 'Top', 'Room 1', 'Shelf A'];
    expect(shortPath(ancestors, 100)).toBe('Hamrun Shop › Top › Room 1 › Shelf A');
    expect(shortPath(ancestors, 20)).toBe('Room 1 › Shelf A');
    expect(shortPath(['A very long room name indeed'], 5)).toBe('A very long room name indeed');
    expect(shortPath([], 10)).toBe('');
  });
});
