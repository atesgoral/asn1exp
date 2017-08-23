const fs = require('fs');

function getBlockContents(s, startIdx) {
  let nesting = 0;
  let idx = startIdx;
  let ch = null;

  while (true) {
    ch = s[idx];

    switch (ch) {
    case '{':
      nesting++;
      break;

    case '}':
      if (!nesting) {
        throw new Error('Unmatched }');
      }

      if (nesting === 1) {
        return s.substring(startIdx + 1, idx);
      }

      nesting--;

      break;
    }

    idx++;

    if (idx === s.length) {
      console.log(s);
      throw new Error('Block not found');
    }
  }
}

function parseSequence(s) {
  const elements = [];

  let idx = 0;
  let match = null;
  let name = null;
  let element = null;

  while (true) {
    match = /^(\.{3}|[\w-]+\b)\s?/.exec(s.slice(idx));

    if (!match) {
      throw new Error('Identifier not found');
    }

    name = match[1];

    idx += match[0].length;

    //console.log('Element in sequence', name);

    if (name !== '...') {
      element = parseElement(s.slice(idx));

      idx += element.length;
      delete element.length;

      let qualifiers = undefined;
      let optional = false;

      match = /^((:?\(SIZE\([^)]+\)\)))+?\s?/.exec(s.slice(idx));

      if (match) {
        qualifiers = match[1];
        idx += match[0].length;
      }

      if (/^OPTIONAL/.test(s.slice(idx))) {
        optional = true;
        idx += 'OPTIONAL'.length;
      }

      elements.push(Object.assign({
        name,
        optional
      }, element));
    }

    if (s[idx] !== ',') {
      break;
    }

    idx++;
  }

  return elements;
}

function parseElement(s) {
  const types = [
    'OCTET STRING',
    'INTEGER',
    'NULL',
    'BOOLEAN',
    'NumericString',
    'SEQUENCE',
    'CHOICE',
    'BIT STRING',
    'ENUMERATED',
    'MAP-EXTENSION'
  ];

  let typeRe = /^(?:\[(\d+)\])?(?:(IMPLICIT)\s)?(TYPE)((?:FROM\(.*?\))?(?:\(SIZE\([^)]+\)\))+|\.\&\w+\(.*?\))?(?:\b(OF\s))?/;
  typeRe = new RegExp(typeRe.source.replace('TYPE', types.join('|')), 'g');

  let match = null;
  let tag = null;
  let implicit = null;
  let type = null;
  let qualifiers = null;
  let ctorOf = null;
  let element = null;

  if (match = typeRe.exec(s)) {
    tag = match[1] && parseInt(match[1], 10);
    implicit = !!match[2];
    type = match[3];
    qualifiers = match[4];
    ctorOf = !!match[5];
    length = match[0].length;

    element = {
      tag,
      implicit,
      type,
      qualifiers,
      length
    };

    // console.log('Element', element);

    if (ctorOf) {
      const el = parseElement(s.slice(typeRe.lastIndex));
      element.ofElement = el;
      element.length += el.length;
    } else {
      switch (type) {
      case 'CHOICE':
      case 'SEQUENCE':
        let block = getBlockContents(s, typeRe.lastIndex);
        element.length += block.length + 2;

        if (block !== '...') {
          element.elements = parseSequence(block);
        } else {
          element.elements = [];
        }
        break;

      case 'BIT STRING':
      case 'ENUMERATED':
        if (s[typeRe.lastIndex] === '{') {
          let block = getBlockContents(s, typeRe.lastIndex);
          element.length += block.length + 2;
          // @todo get values
          // element.values = parseBitString(block);
        }
      }
    }

    return element;
  } else {
    console.log(s);
    throw new Error('could not parse element');
    //return null;
  }
}

function parseOpBody(s) {
  const argRe = /ARGUMENT\s?/g;
  const resRe = /RESULT/g;
  const errRe = /ERRORS/g;
  const codeRe = /CODE/g;

  let argument = null;
  let result = null;
  let errors = null;
  let code = null;

  if (argRe.exec(s)) {
    argument = parseElement(s.slice(argRe.lastIndex));
    delete argument.length;
  }

  // if (resRe.exec(s)) {
  //   result = parseElement(s.slice(resRe.lastIndex));
  //   delete result.length;
  // }

  return {
    argument,
    result,
    errors,
    code
  };
}

let definitions = fs.readFileSync('./definitions/MAP-MobileServiceOperations.EXP', 'UTF-8');

definitions = definitions
  .split('\n') // Split into row
  .filter((row) => !/^--/.test(row)) // Filter out comment rows
  .join(''); // Join rows

definitions = definitions
  .replace(/\s+/g, ' ') // Replace sequental whitespace with a single space
  .replace(/\B \b|\b \B|\B \B/g, ''); // Replace all space except between words

const opRe = /\b([\w-]+) OPERATION::=/g;
let match = null;

const operations = {};

while (match = opRe.exec(definitions)) {
  let operationName = match[1];

  let operation = parseOpBody(getBlockContents(definitions, opRe.lastIndex));

  operations[operationName] = operation;
}

console.log(JSON.stringify(operations, null, 2));
