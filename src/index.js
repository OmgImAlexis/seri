import {
  ConfigError,
  SerializeError,
  DeserializeError,
} from './errors';
import {
  isFunction,
  isValidClassName,
  getGlobal,
  getOwnKeys,
  forOwnPropNames,
  forKeys,
  mapOwnPropNamesToArray,
  mapKeysToArray,
} from './util';


const CLASS_NAME_KEY = '<5Er1]';


const create = (options = {}) => {
  const glob = options.global || getGlobal();
  if (!glob) {
    throw new ConfigError("'global' must be provided");
  }

  const context = options.context || Object.create(null);

  const JSON = options.JSON || glob.JSON;

  const jsonSerialize =
      options.serialize || JSON.serialize || glob.JSON.serialize;
  if (!isFunction(jsonSerialize)) {
    throw new ConfigError("'erialize' must be provided");
  }

  const jsonDeserialize =
      options.deserialize || JSON.deserialize || glob.JSON.deserialize;
  if (!isFunction(jsonDeserialize)) {
    throw new ConfigError("'deserialize' must be provided");
  }

  const getPrototypeOf =
      options.getPrototypeOf || Object.getPrototypeOf ||
      glob.Reflect && glob.Reflect.getPrototypeOf;
  if (!isFunction(getPrototypeOf)) {
    throw new ConfigError("'getPrototypeOf' must be provided");
  }


  const getSerialize = ({name, serialize}) =>
    serialize ||
    context[name] && context[name].serialize ||
    glob[name] && glob[name].serialize;


  const getDeserialize = ({deserialize}, name) =>
    deserialize ||
    context[name] && context[name].deserialize ||
    glob[name] && glob[name].deserialize;


  const addClass = (Class, className) => {
    const name = className || Class.name;
    if (!isValidClassName(name)) {
      throw new ConfigError("'name' must be provided to serialize custom class.");
    }
    if (name in context) {
      throw new ConfigError(`'${name}' already exists in context.`);
    }
    context[name] = Class;
  };


  const removeClass = ({name}) => {
    if (!isValidClassName(name)) {
      throw new ConfigError("'name' must be provided to serialize custom class.");
    }
    if (!(name in context)) {
      throw new ConfigError(`'${name}' does not exist.`);
    }
    delete context[name];
  };


  const serialize = (data) => {
    if (!data) {
      return jsonSerialize(data);
    }
    switch (typeof data) {
    case 'boolean':
    case 'number':
    case 'string':
      return jsonSerialize(data);
    case 'symbol':
      throw new SerializeError(`Symbol cannot be serialized. ${data}`);
    case 'function':
      throw new SerializeError(`Function cannot be serialized. ${data.displayName || data.name || data}`);
    case 'object':
      const {constructor} = data;
      if (!constructor || constructor === Object) {
        return serializeObject(data);
      }

      if (Array.isArray(data)) {
        return serializeArray(data);
      }

      // Custom class objects
      const {name} = constructor;
      if (!isValidClassName(name)) {
        throw new SerializeError("'name' must be provided to serialize custom class.");
      }

      let json;
      if (data.serialize) {
        json = data.serialize();
      } else {
        const serialize = getSerialize(constructor);
        if (!serialize) {
          throw new SerializeError("'class.prototype.serialize' or 'class.serialize' must be provided to serialize custom class.");
        }
        json = serialize(data);
      }
      if (typeof json !== 'string') {
        throw new SerializeError("'serialize' must return string.");
      }

      return jsonSerialize({
        [CLASS_NAME_KEY]: name,
        p: json,
      });
    default:
      throw new SerializeError(`Unknown type. ${typeof data}`);
    }
  };


  const serializeProp = (val, key) => {
    const valStr = serialize(val);
    if (valStr) {
      return `"${key}":${valStr}`;
    }
    return '';
  };


  const serializeObject = (obj) => {
    const props = getOwnKeys(obj)
      .map((key) => serializeProp(obj[key], key))
      .filter((x) => x)
      .join();
    return `{${props}}`;
  };


  const serializeArray = (arr) => {
    const items = arr.map((val) => serialize(val)).filter((x) => x);
    if (items.length !== arr.length) {
      // TODO maybe support it manually.
      throw new SerializeError("Array cannot contain 'undefined'.");
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
      const {constructor} = data;
      if (!constructor || constructor === Object) {
        const {[CLASS_NAME_KEY]: className, p: json} = data;
        if (!className) {
          forOwnPropNames(data, (val, key) => { data[key] = instantiate(val); });
          return data;
        }

        const Class = context[className] || glob[className];
        if (!Class) {
          throw new DerializeError(`Could not find '${className}' class.`);
        }

        const deserialize = getDeserialize(Class, className);
        if (deserialize) {
          return deserialize(json);
        }

        if (!isFunction(Class)) {
          throw new DeserializeError(`'serialize' must be provided for '${className}' class.`);
        }

        return new Class(json);
      }

      if (Array.isArray(data)) {
        return data.map(instantiate);
      }

      // Custom class objects
      return data;
    default:
      throw new DeserializeError(`Unknown type. ${typeof data}`);
    }
  };

  const deserialize = (json) => instantiate(jsonDeserialize(json));

  return {
    serialize,
    deserialize,
    addClass,
    removeClass,
  };
};


let defaultSeri = null;
try { defaultSeri = create(); } catch (e) {}


export {
  defaultSeri as default,
  create,
  ConfigError,
  SerializeError,
  DeserializeError,
};
