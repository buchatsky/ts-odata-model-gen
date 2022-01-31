/* tsgen.js */
const util = require('util');
var path = require('path');
const fs = require('fs');
const program = require('commander');
const request = require('request-promise-native');
const parseXml = require('xml2js').parseString;
const handlebars = require('handlebars');

/*
let package;
try {
    package = require('ts-odata-model-gen/package.json');
} catch {
    try {
        package = require('../package.json').version;
    } catch {}
}
*/
const package = require('./package.json');

program
    //.name(package.name)
    .version(package.version)
    .description(package.description)
    .requiredOption('-u, --url <odata url>', 'OData service url')
    .option('-o, --outDir <output dir>', 'Output directory', 'models')
    .option('-i, --useInterfaces', 'Use interfaces for entity types')
    .option('-n, --nonNullAssertions', 'Use non-null property assertions')
    .option('-c, --camelCaseProps', 'Use camelCase property names')
    .option('-k, --kebabCaseModules', 'Use kebab-case module names')
    .parse(process.argv);

const options = program.opts();
options.metadataUrl = new URL('$metadata', options.url).href;
options.nonNullAssertions = !options.useInterfaces && options.nonNullAssertions;

function toCamelCase(str) {
    return str && str.length > 0 &&
        str[0].toLowerCase() + str.substring(1);
}

function toKebabCase(str) {
    return str && str
      .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
      .map(x => x.toLowerCase())
      .join('-');
}

function prepareComplexType(complexType) {
    if (complexType) {
        complexType.imports = [];

        if (complexType.Property) {
            complexType.Property.forEach(property => {
                const typeName = setPropertyInfo(property.$);
                if (typeName) {
                    const moduleName = getModuleName(typeName);

                    if (typeName !== complexType.$.Name && // self
                    complexType.imports.every(imp => imp.typeName !== typeName)) { // duplicates
                        complexType.imports.push({ typeName, moduleName });
                    }
                }
            });    
        }   
        
        //complexType.imports.sort((i1, i2) => i1.typeName.localeCompare(i2.typeName));
    }
}

function prepareEntityType(entityType) {
    if (entityType) {
        entityType.imports = [];

        if (entityType.Property) {
            entityType.Property.forEach(property => {
                const typeName = setPropertyInfo(property.$);
                if (typeName) {
                    const moduleName = getModuleName(typeName);

                    if (typeName !== entityType.$.Name && // self
                    entityType.imports.every(imp => imp.typeName !== typeName)) { // duplicates
                        entityType.imports.push({ typeName, moduleName });
                    }
                }
            });    
        }   

        if (entityType.NavigationProperty) {
            entityType.NavigationProperty.forEach(navProperty => {
                const typeName = setNavPropertyInfo(navProperty.$);
                const moduleName = getModuleName(typeName);

                if (typeName !== entityType.$.Name && // self
                entityType.imports.every(imp => imp.typeName !== typeName)) { // duplicates
                    entityType.imports.push({ typeName, moduleName });
                }
            });    
        }   

        //entityType.imports.sort((i1, i2) => i1.typeName.localeCompare(i2.typeName));
    }
}

function setPropertyInfo(property) {
    let typeName;
    const type = property.Type;

    const getType = t => {
        let segments = t.split('.');
        return segments[segments.length - 1];
    }

    const getPrimitiveType = t => {
        switch (t) {
            case 'Int16':
            case 'Int32':
            case 'Int64':
            case 'Single':
            case 'Double':
            case 'Decimal':
                return 'number'
            case 'String':
            case 'Date':
            case 'DateTimeOffset':
            case 'TimeOfDay':
            case 'Byte':
            case 'SByte':
            case 'Binary':
                return 'string'
            case 'Boolean':
                return 'boolean'
            default:
                return 'any'
        }
    }

    if (type.startsWith('Edm.')) {
        typeName = getPrimitiveType(type.substring(4, type.length));
        property.isPrimitive = true;
        property.typeName = typeName;
        return null;
    } else {
        typeName = getType(type);
        property.typeName = typeName;
        property.isPrimitive = false;
        return typeName;
    }
}

function setNavPropertyInfo(navProperty) {
    let entityTypeName;
    const type = navProperty.Type;

    const getType = t => {
        let segments = t.split('.');
        return segments[segments.length - 1];
    }

    if (type.startsWith('Collection(')) {
        entityTypeName = getType(type.substring(11, type.length - 1));
        navProperty.isCollection = true;
        navProperty.typeName = `${entityTypeName}[]`;
    } else {
        entityTypeName = getType(type);
        navProperty.isCollection = false;
        navProperty.typeName = entityTypeName;
    }
    return entityTypeName;
}

function getModuleName(typeName) {
    return options.kebabCaseModules ? toKebabCase(typeName) : typeName;
}

async function loadMetadata() {
    const response = await request.get(options.metadataUrl);
    const metadata = await util.promisify(parseXml)(response);
    const schema = metadata['edmx:Edmx']['edmx:DataServices'][0]['Schema'][0];

    if (!fs.existsSync(options.outDir)) {
        fs.mkdirSync(options.outDir);
    }
    
    const date = new Date().toLocaleString();
    const commonContext = {
        date,
        version: package.version,
        description: package.description,
        useInterfaces: options.useInterfaces
    };

    const exportsContext = {
        exports: []
    };

    // EnumTypes
    if (schema.EnumType) {
        const generateEnum = handlebars.compile(enumTemplate, { noEscape: true });
        schema.EnumType.forEach(enumType => {
            handlebars.Utils.extend(enumType, commonContext);
            const enumOutput = generateEnum(enumType);
            const typeName = enumType.$.Name;
            const moduleName = getModuleName(typeName);
            const fileName = path.resolve(options.outDir, moduleName + '.ts');
            fs.writeFileSync(fileName, enumOutput, 'utf8');
            exportsContext.exports.push({ typeName, moduleName });
        });
    }

    // ComplexTypes
    if (schema.ComplexType) {
        const generateComplex = handlebars.compile(complexTemplate, { noEscape: true });
        schema.ComplexType.forEach(complexType => {
            prepareComplexType(complexType);
            handlebars.Utils.extend(complexType, commonContext);
            const complexOutput = generateComplex(complexType);
            const typeName = complexType.$.Name;
            const moduleName = getModuleName(typeName);
            const fileName = path.resolve(options.outDir, moduleName + '.ts');
            fs.writeFileSync(fileName, complexOutput, 'utf8');
            exportsContext.exports.push({ typeName, moduleName });
        });
    }

    // EntityTypes
    if (schema.EntityType) {
        const generateEntity = handlebars.compile(entityTemplate, { noEscape: true });
        schema.EntityType.forEach(entityType => {
            prepareEntityType(entityType);
            handlebars.Utils.extend(entityType, commonContext);
            const entityOutput = generateEntity(entityType);
            const typeName = entityType.$.Name;
            const moduleName = getModuleName(typeName);
            const fileName = path.resolve(options.outDir, moduleName + '.ts');
            fs.writeFileSync(fileName, entityOutput, 'utf8');
            exportsContext.exports.push({ typeName, moduleName });
        });
    }

    // exports
    if (exportsContext.exports.length > 0) {
        //exportsContext.exports.sort((i1, i2) => i1.typeName.localeCompare(i2.typeName));

        const generateExports = handlebars.compile(exportsTemplate, { noEscape: true });
        handlebars.Utils.extend(exportsContext, commonContext);
        const exportsOutput = generateExports(exportsContext);
        const moduleName = getModuleName('AllModels');
        const fileName = path.resolve(options.outDir, moduleName + '.ts');
        fs.writeFileSync(fileName, exportsOutput, 'utf8');
    }
}

function registerHelpers() {
    handlebars.registerHelper('nonNullAssertion', property => {
        return options.nonNullAssertions && property.Nullable == 'false' ? '!' : ''
    })

    handlebars.registerHelper('getPropertyName', property => {
        return options.camelCaseProps ? toCamelCase(property.Name) : property.Name;
    })
}

registerHelpers();
loadMetadata();

const enumTemplate =
`/* This code was generated by ts-odata-gen code generator */
/* tslint:disable */

export enum {{$.Name}} {
    {{#each Member}}
    {{$.Name}} = {{$.Value}}{{#unless @last}},{{/unless}}
    {{/each}}
}`;

const complexTemplate =
`/* This code was generated by ts-odata-gen code generator */
/* tslint:disable */
{{#imports}}import { {{typeName}} } from './{{moduleName}}';
{{/imports}}

export interface {{$.Name}} {
    {{#each Property}}
    {{getPropertyName $}}: {{$.typeName}};
    {{/each}}
}`;

const entityTemplate =
`/* This code was generated by {{description}} v{{version}} */
/* tslint:disable */
{{#imports}}import { {{typeName}} } from './{{moduleName}}';
{{/imports}}

export {{#if useInterfaces}}interface{{else}}class{{/if}} {{$.Name}} {
    {{#each Property}}
    {{getPropertyName $}}{{nonNullAssertion $}}: {{$.typeName}};
    {{/each}}
    {{#each NavigationProperty}}
    {{getPropertyName $}}{{nonNullAssertion $}}: {{$.typeName}};
    {{/each}}
}`;

const exportsTemplate =
`/* This code was generated by ts-odata-gen code generator */
/* tslint:disable */
{{#exports}}export { {{typeName}} } from './{{moduleName}}';
{{/exports}}`;
