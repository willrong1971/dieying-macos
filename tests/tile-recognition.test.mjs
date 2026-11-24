import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {faceImage, faces, practiceRound, tileGroups} from '../src/tile-recognition.js';

test('all seven groups have distinct named faces with both bundled preview variants', () => {
  assert.deepEqual(tileGroups.map(group => group.faces.length), [9, 9, 9, 4, 3, 4, 4]);
  assert.equal(faces.size, 42);
  for (const face of faces.values()) {
    assert.ok(face.zh && face.en && face.pinyin, face.id);
    for (const theme of ['ivory', 'porcelain']) {
      assert.ok(existsSync(new URL(faceImage(face.id, theme))), face.id);
    }
  }
});

test('every practice round spans all groups with one unambiguous answer per question', () => {
  const previous = practiceRound().map(question => question.target.id);
  const questions = practiceRound(previous);
  assert.equal(questions.length, 7);
  assert.equal(new Set(questions.map(question => question.target.group)).size, 7);
  for (const [index, {target, options}] of questions.entries()) {
    assert.ok(!previous.includes(target.id));
    assert.equal(new Set(options.map(face => face.id)).size, 3);
    assert.equal(options.filter(face => face === target).length, 1);
    const others = options.filter(face => face !== target);
    assert.ok(others.every(face => (face.group === target.group) === (index >= 3)));
  }
});
