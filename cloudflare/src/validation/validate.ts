// Lightweight request body validator (no external deps)
// Usage:
//   const { data, errors } = await validateBody(request, loginSchema);
//   if (errors) return error(errors, 400);

import type { Schema, FieldRule } from './schemas';

export interface ValidationResult<T = Record<string, unknown>> {
  data: T;
  errors: string | null;
}

/** Parse JSON body and validate against schema. Returns { data, errors }. */
export async function validateBody<T = Record<string, unknown>>(
  request: Request,
  schema: Schema
): Promise<ValidationResult<T>> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return { data: {} as T, errors: 'Invalid JSON body' };
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { data: {} as T, errors: 'Request body must be a JSON object' };
  }

  const issues: string[] = [];

  for (const [field, rule] of Object.entries(schema)) {
    const value = body[field];
    const label = rule.label || field;

    // Required check
    if (rule.required && (value === undefined || value === null || value === '')) {
      issues.push(`${label} is required`);
      continue;
    }

    // Skip optional missing fields
    if (value === undefined || value === null || value === '') continue;

    // Type check
    if (rule.type === 'string' && typeof value !== 'string') {
      issues.push(`${label} must be a string`);
      continue;
    }
    if (rule.type === 'number' && typeof value !== 'number') {
      issues.push(`${label} must be a number`);
      continue;
    }
    if (rule.type === 'boolean' && typeof value !== 'boolean') {
      issues.push(`${label} must be a boolean`);
      continue;
    }

    // String constraints
    if (typeof value === 'string') {
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        issues.push(`${label} must be at least ${rule.minLength} characters`);
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        issues.push(`${label} must be at most ${rule.maxLength} characters`);
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        issues.push(`${label} has invalid format`);
      }
      if (rule.oneOf && !rule.oneOf.includes(value)) {
        issues.push(`${label} must be one of: ${rule.oneOf.join(', ')}`);
      }
    }

    // Number constraints
    if (typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        issues.push(`${label} must be at least ${rule.min}`);
      }
      if (rule.max !== undefined && value > rule.max) {
        issues.push(`${label} must be at most ${rule.max}`);
      }
    }
  }

  if (issues.length > 0) {
    return { data: body as T, errors: issues.join('; ') };
  }

  return { data: body as T, errors: null };
}
