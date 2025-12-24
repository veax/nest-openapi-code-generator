import { OpenAPISpec } from '../types/openapi';

const SHARED_SCHEMA_MARKER = 'x-shared';
const SHARED_FILE_PATH = '../shared/shared.dto';

export function isSharedSchema(schema: any): boolean {
  return schema[SHARED_SCHEMA_MARKER] === true;
}

export function getSharedDtoNames(spec: OpenAPISpec): string[] {
  const schemas = spec.components?.schemas || {};
  return Object.entries(schemas)
    .filter(([_, schema]) => isSharedSchema(schema))
    .map(([name]) => `${name}Dto`);
}

export function resolveDtoImports(
  usedDtos: Set<string>,
  spec: OpenAPISpec
): { localDtos: string[]; sharedDtosUsed: string[] } {
  const sharedDtos = getSharedDtoNames(spec);
  const localDtos: string[] = [];
  const sharedDtosUsed: string[] = [];
  usedDtos.forEach(dto => {
    if (sharedDtos.includes(dto)) {
      sharedDtosUsed.push(dto);
    } else {
      localDtos.push(dto);
    }
  });
  return { localDtos, sharedDtosUsed };
}

export function generateImportStatements(
  localDtos: string[],
  sharedDtosUsed: string[],
  resourceName: string
): string {
  const imports: string[] = [];
  if (localDtos.length > 0) {
    imports.push(
      `import { ${localDtos.join(', ')} } from './${resourceName}.dto';`
    );
  }
  if (sharedDtosUsed.length > 0) {
    imports.push(
      `import { ${sharedDtosUsed.join(', ')} } from '${SHARED_FILE_PATH}';`
    );
  }
  return imports.join('\n');
}

