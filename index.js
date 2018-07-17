const qualifierRe = /(?:\.\&\w+)?\([^()]*(?:\([^)]*\))*\)/;

function mixin(target, source) {
  for (var p in source) {
    if (source[p] !== undefined) {
      target[p] = source[p];
    }
  }

  return target;
}

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

    if (name !== '...') {
      element = parseElement(s.slice(idx));

      idx += element.length;
      delete element.length;

      let qualifiers = undefined;
      let optional = undefined;

      const postQualifierRe = new RegExp(
        /^(QUALIFIER)?\s?/
          .source
          .replace('QUALIFIER', qualifierRe.source)
      );

      match = postQualifierRe.exec(s.slice(idx));

      if (match) {
        qualifiers = match[1];
        idx += match[0].length;
      }

      if (/^OPTIONAL/.test(s.slice(idx))) {
        optional = true;
        idx += 'OPTIONAL'.length;
      }

      elements.push(mixin(element, {
        name,
        qualifiers,
        optional
      }));
    }

    if (s[idx] !== ',') {
      break;
    }

    idx++;
  }

  return elements;
}

function parseBitString(s) {
  return s
    .split(',')
    .filter((s) => s !== '...')
    .map((s) => {
      const match = /^([\w-]+)\((\d+)\)/.exec(s);

      if (!match) {
        throw new Error('Could not parse bit string value');
      }

      return {
        name: match[1],
        value: parseInt(match[2], 10)
      };
    });
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

  if (/^TRUE\b/.test(s)) {
    return {
      type: 'BOOLEAN',
      value: true,
      length: 'TRUE'.length
    };
  }

  const typeRe = new RegExp(
    /^(?:\[(\d+)\])?(?:(IMPLICIT)\s)?(TYPE)\s?(QUALIFIER)?(?:\b(OF\s))?/
      .source
      .replace('TYPE', types.join('|'))
      .replace('QUALIFIER', qualifierRe.source),
    'g'
  );

  let match = null;
  let tag = null;
  let implicit = null;
  let type = null;
  let qualifiers = null;
  let ctorOf = null;
  let element = null;

  if (match = typeRe.exec(s)) {
    tag = match[1] && parseInt(match[1], 10);
    implicit = match[2] && true;
    type = match[3];
    qualifiers = match[4];
    ctorOf = !!match[5];
    length = match[0].length;

    element = {
      name: undefined, // to hold first position in output
      tag,
      implicit,
      type,
      qualifiers,
      length
    };

    if (ctorOf) {
      const el = parseElement(s.slice(typeRe.lastIndex));
      element.ofElement = el;
      element.length += el.length;
      delete el.length;
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
          element.values = parseBitString(block);
        }
      }
    }

    return element;
  } else {
    throw new Error('could not parse element');
  }
}

function parseOpBody(s) {
  const argumentRe = /ARGUMENT\s?/g;
  const returnResultRe = /RETURN RESULT\s?/g;
  const resultRe = /RESULT\s?/g;
  const codeRe = /CODE\s?/g;

  let argument = null;
  let result = null;
  let code = null;

  if (argumentRe.exec(s)) {
    argument = parseElement(s.slice(argumentRe.lastIndex));
    delete argument.length;
  }

  if (returnResultRe.exec(s)) {
    result = parseElement(s.slice(returnResultRe.lastIndex));
    delete result.length;
  } else if (resultRe.exec(s)) {
    result = parseElement(s.slice(resultRe.lastIndex));
    delete result.length;
  }

  if (codeRe.exec(s)) {
    const match = /^local:(\d+)/.exec(s.slice(codeRe.lastIndex));

    if (match) {
      code = parseInt(match[1], 10);
    } else {
      throw new Error('Could not parse code');
    }
  }

  return {
    argument,
    result,
    code
  };
}

function parseErrorBody(s) {
  const parameterRe = /PARAMETER\s?/g;
  const codeRe = /CODE\s?/g;

  let parameter = null;
  let result = null;
  let code = null;

  if (parameterRe.exec(s)) {
    parameter = parseElement(s.slice(parameterRe.lastIndex));
    delete parameter.length;
  }

  if (codeRe.exec(s)) {
    const match = /^local:(\d+)/.exec(s.slice(codeRe.lastIndex));

    if (match) {
      code = parseInt(match[1], 10);
    } else {
      throw new Error('Could not parse code');
    }
  }

  return {
    parameter,
    code
  };
}

function parse(s) {
  s = s
    .split('\n') // Split into row
    .filter((row) => !/^--/.test(row)) // Filter out comment rows
    .join(''); // Join rows

  s = s
    .replace(/\s+/g, ' ') // Replace sequental whitespace with a single space
    .replace(/\B \b|\b \B|\B \B/g, ''); // Replace all space except between words

  const opRe = /\b([\w-]+) (OPERATION|ERROR)::=/g;
  let match = null;

  const blocks = {};

  while (match = opRe.exec(s)) {
    let blockName = match[1];
    let blockType = match[2];
    let block = null;

    if (blockType === 'OPERATION') {
      block = parseOpBody(getBlockContents(s, opRe.lastIndex));
    } else {
      block = parseErrorBody(getBlockContents(s, opRe.lastIndex));
    }

    blocks[blockName] = block;
  }

  return { blocks };
}

module.exports = Object.freeze({
  parse
});
