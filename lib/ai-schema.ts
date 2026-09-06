// The schema subset used by SBuddy routes; JSON mode alone does not enforce it.
export function assertStructuredOutput(
  value: unknown,
  schema: Record<string, unknown>,
  path = '$',
): void {
  const fail = () => {
    throw new Error('AI output does not match schema at ' + path);
  };
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) fail();
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return fail();
      const record = value as Record<string, unknown>;
      const properties = (schema.properties ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      for (const key of (schema.required ?? []) as string[])
        if (!Object.hasOwn(record, key)) fail();
      for (const [key, item] of Object.entries(record)) {
        if (Object.hasOwn(properties, key))
          assertStructuredOutput(item, properties[key], path + '.' + key);
        else if (schema.additionalProperties === false) fail();
      }
      break;
    }
    case 'array':
      if (!Array.isArray(value)) return fail();
      if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
        fail();
      if (typeof schema.minItems === 'number' && value.length < schema.minItems)
        fail();
      if (schema.items)
        value.forEach((item, index) =>
          assertStructuredOutput(
            item,
            schema.items as Record<string, unknown>,
            path + '[' + index + ']',
          ),
        );
      break;
    case 'string':
      if (typeof value !== 'string') return fail();
      if (
        typeof schema.maxLength === 'number' &&
        Array.from(value).length > schema.maxLength
      )
        fail();
      if (
        typeof schema.minLength === 'number' &&
        Array.from(value).length < schema.minLength
      )
        fail();
      if (
        typeof schema.pattern === 'string' &&
        !new RegExp(schema.pattern).test(value)
      )
        fail();
      break;
    case 'number':
    case 'integer':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (schema.type === 'integer' && !Number.isInteger(value))
      )
        return fail();
      if (typeof schema.minimum === 'number' && value < schema.minimum) fail();
      if (typeof schema.maximum === 'number' && value > schema.maximum) fail();
      break;
    case 'boolean':
      if (typeof value !== 'boolean') fail();
      break;
    default:
      throw new Error('Unsupported AI schema type');
  }
}
