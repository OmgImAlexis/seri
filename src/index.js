import {
  ConfigError,
  StringifyError,
  ParseError,
} from './errors';

import {
  isFunction,
  isValidClassName,
  getGlobal,
  getOwnKeys,
  forOwnPropNames
} from './util';

const CLASS_NAME_KEY = '<5Er1]';

const create = (options = {}) => {
  const glob = options.global || getGlobal();
  if (!glob) {
    throw new ConfigError(`"global" must be provided.`);
  }

  const context = options.context || Object.create(null);

  const JSON = options.JSON || glob.JSON;

  const jsonStringify =
    options.stringify || JSON.stringify || glob.JSON.stringify;
  if (!isFunction(jsonStringify)) {
    throw new ConfigError(`"stringify" must be provided.`);
  }

  const jsonParse =
    options.parse || JSON.parse || glob.JSON.parse;
  if (!isFunction(jsonParse)) {
    throw new ConfigError(`"parse" must be provided.`);
  }

  const getPrototypeOf =
    options.getPrototypeOf || Object.getPrototypeOf ||
    glob.Reflect && glob.Reflect.getPrototypeOf;
  if (!isFunction(getPrototypeOf)) {
    throw new ConfigError(`"getPrototypeOf" must be provided.`);
  }


  const getSerialize = ({ name, serialize }) =>
    serialize ||
    context[name] && context[name].serialize ||
    glob[name] && glob[name].serialize;


  const getDeserialize = ({ deserialize }, name) =>
    deserialize ||
    context[name] && context[name].deserialize ||
    glob[name] && glob[name].deserialize;


  const addClass = (Class, className) => {
    const name = className || Class.name;
    if (!isValidClassName(name)) {
      throw new ConfigError(`"name" must be provided to serialize custom class.`);
    }
    if (name in context) {
      throw new ConfigError(`"${name}" already exists in context.`);
    }
    context[name] = Class;
  };


  const removeClass = ({ name }) => {
    if (!isValidClassName(name)) {
      throw new ConfigError(`"name" must be provided to serialize custom class.`);
    }
    if (!(name in context)) {
      throw new ConfigError(`"${name}" does not exist.`);
    }
    delete context[name];
  };


  const serialize = (data) => {
    if (!data) {
      return jsonStringify(data);
    }
    switch (typeof data) {
      case 'boolean':
      case 'number':
      case 'string':
        return jsonStringify(data);
      case 'symbol':
        throw new StringifyError(`Symbol cannot be serialized. ${String(data)}`);
      case 'function':
        throw new StringifyError(`Function cannot be serialized. ${data.displayName || data.name || data}`);
      case 'object':
        const { constructor } = data;
        if (!constructor || constructor === Object) {
          return stringifyObject(data);
        }

        if (Array.isArray(data)) {
          return stringifyArray(data);
        }

        // Custom class objects
        const { name } = constructor;
        if (!isValidClassName(name)) {
          throw new StringifyError(`"name" must be provided to serialize custom class.`);
        }

        let json;
        if (data.serialize) {
          json = data.serialize();
        } else {
          const serialize = getSerialize(constructor);
          if (!serialize) {
            throw new StringifyError(`"class.prototype.serialize" or "class.serialize" must be provided to serialize custom class.`);
          }
          json = serialize(data);
        }
        if (typeof json !== 'string') {
          throw new StringifyError(`"serialize" must return string.`);
        }

        return jsonStringify({
          [CLASS_NAME_KEY]: name,
          p: json,
        });
      default:
        throw new StringifyError(`Unknown type. ${typeof data}`);
    }
  };

  const stringifyProp = (val, key) => {
    const valStr = serialize(val);
    if (valStr) {
      return `"${key}":${valStr}`;
    }
    return '';
  };

  const stringifyObject = (obj) => {
    const props = getOwnKeys(obj)
      .map((key) => stringifyProp(obj[key], key))
      .filter((x) => x)
      .join();
    return `{${props}}`;
  };

  const stringifyArray = (arr) => {
    const items = arr.map((val) => serialize(val)).filter((x) => x);
    if (items.length !== arr.length) {
      // TODO maybe support it manually.
      throw new StringifyError(`Array cannot contain "undefined".`);
    }
    return `[${items}]`;
  };

  const instantiate = (data) => {
    if (!data) {
      return data;
    }
    switch (typeof data) {
      case 'boolean':
      case 'number':
      case 'string':
      case 'symbol':
      case 'function':
        return data;
      case 'object':
        const { constructor } = data;
        if (!constructor || constructor === Object) {
          const { [CLASS_NAME_KEY]: className, p: json } = data;
          if (!className) {
            forOwnPropNames(data, (val, key) => {
              data[key] = instantiate(val);
            });
            return data;
          }

          const Class = context[className] || glob[className];
          if (!Class) {
            throw new ParseError(`Could not find '${className}' class.`);
          }

          const deserialize = getDeserialize(Class, className);
          if (deserialize) {
            return deserialize(json);
          }

          if (!isFunction(Class)) {
            throw new ParseError(`"serialize" must be provided for "${className}" class.`);
          }

          return new Class(json);
        }

        if (Array.isArray(data)) {
          return data.map(instantiate);
        }

        // Custom class objects
        return data;
      default:
        throw new ParseError(`Unknown type. ${typeof data}`);
    }
  };

  const deserialize = (json) => instantiate(jsonParse(json));

  return {
    serialize,
    deserialize,
    addClass,
    removeClass,
  };
};

const defaultSeri = create();

export {
  defaultSeri as default,
  create,
  ConfigError,
  StringifyError,
  ParseError,
};