import * as path from 'path';
import { GeneratorConfig } from '../types/config';
import { SpecParser } from '../parser/spec-parser';
import { DtoGenerator } from '../generator/dto-generator';
import { ControllerGenerator } from '../generator/controller-generator';
import { ServiceGenerator } from '../generator/service-generator';
import { FileWriter } from '../generator/file-writer';
import { Logger } from '../utils/logger';
import { OpenAPISpec } from '../types/openapi';
import { DtoImporter } from '../utils/dto-importer';

export class GeneratorOrchestrator {
  private specParser: SpecParser;
  private dtoGenerator: DtoGenerator;
  private controllerGenerator: ControllerGenerator;
  private serviceGenerator: ServiceGenerator;
  private fileWriter: FileWriter;
  private logger: Logger;

  constructor(private config: GeneratorConfig) {
    this.logger = new Logger();
    this.specParser = new SpecParser();
    this.dtoGenerator = new DtoGenerator();
    this.controllerGenerator = new ControllerGenerator(
      this.config.templateDir,
      this.config.generatorOptions?.includeErrorTypesInReturnType ?? false,
      this.config.generateDtos
    );
    this.serviceGenerator = new ServiceGenerator(
      this.config.templateDir, 
      this.config.generateDtos
    );
    this.fileWriter = new FileWriter(this.logger);
  }

  async generate(): Promise<void> {
    try {
      this.logger.info('Starting code generation...');

      const specPaths = await this.specParser.findSpecs(this.config.specsDir);

      if (specPaths.length === 0) {
        this.logger.warn(`No OpenAPI specs found in ${this.config.specsDir}`);
        return;
      }

      this.logger.info(`Found ${specPaths.length} spec(s)`);

      for (const specPath of specPaths) {
        await this.generateFromSpec(specPath);
      }

      this.logger.success('Code generation completed!');
    } catch (error: any) {
      this.logger.error(`Generation failed: ${error.message}`);
      throw error;
    }
  }

  private async generateFromSpec(specPath: string): Promise<void> {
    this.logger.info(`Processing: ${specPath}`);

    const spec = await this.specParser.parseSpec(specPath);
    const resourceName = this.specParser.extractResourceName(specPath);

    const outputDir = path.join(this.config.outputDir, resourceName);

    // Clear any previous inline response schemas
    this.controllerGenerator.clearInlineResponseSchemas();

    // Generate controller first to collect inline response schemas
    if (this.config.generateControllers && spec.paths) {
      await this.generateController(resourceName, spec, outputDir);
    }

    // Generate DTOs including inline response schemas
    if (this.config.generateDtos && (spec.components?.schemas || this.controllerGenerator.getInlineResponseSchemas().size > 0)) {
      await this.generateDtos(resourceName, spec, outputDir);
    }

    if (this.config.generateServices && spec.paths) {
      await this.generateService(resourceName, spec, outputDir);
    }
  }

  private async generateDtos(
    resourceName: string,
    spec: OpenAPISpec,
    outputDir: string
  ): Promise<void> {
    const schemas = spec.components?.schemas || {};
    const inlineResponseSchemas = this.controllerGenerator.getInlineResponseSchemas();

    // Separate shared and resource-specific schemas
    const sharedSchemas: { [key: string]: any } = {};
    const resourceSchemas: { [key: string]: any } = {};
    for (const [name, schema] of Object.entries(schemas)) {
      if (DtoImporter.isSharedSchema(schema)) {
        sharedSchemas[name] = schema;
      } else {
        resourceSchemas[name] = schema;
      }
    }

    // Generate shared DTOs 
    if (Object.keys(sharedSchemas).length > 0) {
      const sharedDir = path.join(this.config.outputDir, DtoImporter.SHARED_FOLDER);
      const sharedDtoPath = path.join(sharedDir, `${DtoImporter.SHARED_DTO_FILE}.ts`);
      const sharedDtoContent = await this.dtoGenerator.generateDtos(sharedSchemas, undefined, spec);
      await this.fileWriter.writeFile(sharedDtoPath, sharedDtoContent);
    }

    // Generate resource-specific DTOs (including inline response DTOs)
    if (
      Object.keys(resourceSchemas).length > 0 ||
      (inlineResponseSchemas && inlineResponseSchemas.size > 0)
    ) {
      const dtoOutputPath = path.join(outputDir, `${resourceName}.dto.ts`);
      const dtoContent = await this.dtoGenerator.generateDtos(resourceSchemas, inlineResponseSchemas, spec);
      await this.fileWriter.writeFile(dtoOutputPath, dtoContent);
    }
  }

  private async generateController(
    resourceName: string,
    spec: OpenAPISpec,
    outputDir: string
  ): Promise<void> {
    const controllerOutputPath = path.join(outputDir, `${resourceName}.controller.base.ts`);

    const controllerCode = await this.controllerGenerator.generateController(
      resourceName,
      spec.paths,
      spec
    );

    await this.fileWriter.writeFile(controllerOutputPath, controllerCode);
  }

  private async generateService(
    resourceName: string,
    spec: OpenAPISpec,
    outputDir: string
  ): Promise<void> {
    const serviceOutputPath = path.join(outputDir, `${resourceName}.service.ts`);
    
    const serviceCode = await this.serviceGenerator.generateService(
      resourceName,
      spec.paths,
      spec
    );

    await this.fileWriter.writeFile(serviceOutputPath, serviceCode);
  }
}