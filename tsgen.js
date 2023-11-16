#!/usr/bin/env node

const util = require('util');
var path = require('path');
const fs = require('fs');
const program = require('commander');
const https = require('https');
var axios = require('axios');
const parseXml = require('xml2js').parseString;
const handlebars = require('handlebars');

const package = require('./package.json');

program
    //.name(package.name)
    .version(package.version)
    .description(package.description)
    .requiredOption('-u, --url <odata_url>', 'OData service url')
    .option('-o, --outDir <output_dir>', 'output directory', 'models')
    .option('-b, --baseType <class|interface>', 'base type for entity types')
    .option('-f, --useInterfaces', 'use interfaces instead of classes')
    .option('-s, --strictNullability', 'use strict nullability assertions for properties')
    .option('-i, --initNonNullProps', 'use initializers for non-nullable properties')
    .option('-c, --camelCaseProps', 'use camelCase property names')
    .option('-k, --kebabCaseModules', 'use kebab-case module names')
    .option('-d, --useDateProps', 'use Date type for date/time properties')
    .option('--ignoreCertErrors', 'ignore SSL/TLS certificate errors')
    .parse(process.argv);

const options = program.opts();
const baseUrl = new URL(options.url);
options.metadataUrl = new URL(path.join(baseUrl.pathname, '$metadata'), baseUrl.origin).href;

options.strictNullability = !options.useInterfaces && options.strictNullability;
options.initNonNullProps = !options.useInterfaces && options.initNonNullProps;

if (options.ignoreCertErrors) {
    axios = axios.create({
        httpsAgent: new https.Agent({  
          rejectUnauthorized: false
        })
      });    
}

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
        
        complexType.imports.sort((i1, i2) => i1.typeName.localeCompare(i2.typeName));
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

        entityType.imports.sort((i1, i2) => i1.typeName.localeCompare(i2.typeName));
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
                return 'number';
            case 'Date':
            case 'DateTimeOffset':
            //case 'TimeOfDay':
                return options.useDateProps ?  'Date' : 'string';
            case 'String':
            case 'Byte':
            case 'SByte':
            case 'Binary':
            case 'TimeOfDay':
                return 'string';
            case 'Boolean':
                return 'boolean';
            default:
                return 'any';
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

let schema;

async function loadMetadata() {
    const response = await axios.get(options.metadataUrl);
    const metadata = await util.promisify(parseXml)(response.data);
    schema = metadata['edmx:Edmx']['edmx:DataServices'][0]['Schema'][0];

    if (!fs.existsSync(options.outDir)) {
        fs.mkdirSync(options.outDir);
    }
    
    const date = new Date().toLocaleString();
    const commonContext = {
        date,
        version: package.version,
        description: package.description,
        baseType: options.baseType,
        baseModuleName: getModuleName(options.baseType),
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
            //const entityOutput = generateEntity(entityType, { data: { schema } });
            const typeName = entityType.$.Name;
            const moduleName = getModuleName(typeName);
            const fileName = path.resolve(options.outDir, moduleName + '.ts');
            fs.writeFileSync(fileName, entityOutput, 'utf8');
            exportsContext.exports.push({ typeName, moduleName });
        });
    }

    // exports
    if (exportsContext.exports.length > 0) {
        exportsContext.exports.sort((i1, i2) => i1.typeName.localeCompare(i2.typeName));

        const generateExports = handlebars.compile(exportsTemplate, { noEscape: true });
        handlebars.Utils.extend(exportsContext, commonContext);
        const exportsOutput = generateExports(exportsContext);
        const moduleName = getModuleName('AllModels');
        const fileName = path.resolve(options.outDir, moduleName + '.ts');
        fs.writeFileSync(fileName, exportsOutput, 'utf8');
    }
}

function registerHelpers() {
    handlebars.registerHelper('strictAssertion', property => {
        if (options.strictNullability) {
            if (property.Nullable == 'false') {
                return options.initNonNullProps ? '' : '!'
            }
            else {
                return '?';
            }
        }
        else {
            return '';
        }
    });

    handlebars.registerHelper('nonNullDefault', property => {
        getDefaultVal = tn => {
            switch (tn) {
                //case 'bigint'    : return 'BigInt(0)';
                case 'boolean'   : return 'false';
                case 'number'    : return '0';
                //case 'object'    : return '{}';
                case 'string'    : return '""';
                default          : return '';
            }
        }

        findEnumType = t => 
            schema.EnumType ? schema.EnumType.find(e => e.$.Name == t) : null;

        getEnumDefaultVal = et => {
            if (et.Member) {
                const mv = et.Member.find(m => m.$.Value == '0');
                if (mv) {
                    return `${et.$.Name}.${mv.$.Name}`;
                }
            }
            return `<${et.$.Name}> 0`;
        }

        if (options.initNonNullProps && property.Nullable == 'false') {
            let defaultVal = '';
            if (property.isPrimitive) {
                defaultVal = getDefaultVal(property.typeName);
            }
            /*else if (property.isCollection) {
                defaultVal = '[]';
            }*/
            else {
                const enumType = findEnumType(property.typeName);
                if (enumType) {
                    defaultVal = getEnumDefaultVal(enumType);
                }
                else {
                    defaultVal = `new ${property.typeName}()`;
                }
            }
            return ` = ${defaultVal}`;
        }
        else {
            return '';
        }
    });

    handlebars.registerHelper('nonNullNavDefault', property => {
        if (options.initNonNullProps && property.Nullable == 'false') {
            let defaultVal = '';
            if (property.isCollection) {
                defaultVal = '[]';
            }
            else {
                defaultVal = `new ${property.typeName}()`;
            }
            return ` = ${defaultVal}`;
        }
        else {
            return '';
        }
    });

    handlebars.registerHelper('getPropertyName', property => {
        let propName = options.camelCaseProps ? toCamelCase(property.Name) : property.Name;
        return options.useInterfaces ? propName + '?' : propName;
    });
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

export {{#if useInterfaces}}interface{{else}}class{{/if}} {{$.Name}} {
    {{#each Property}}
    {{getPropertyName $}}{{strictAssertion $}}: {{$.typeName}}{{nonNullDefault $}};
    {{/each}}
}`;

const entityTemplate =
`/* This code was generated by {{description}} v{{version}} */
/* tslint:disable */
{{#if baseType}}
import { {{baseType}} } from './{{baseModuleName}}';
{{/if}}
{{#imports}}import { {{typeName}} } from './{{moduleName}}';
{{/imports}}

export {{#if useInterfaces}}interface{{else}}class{{/if}} {{$.Name}}{{#baseType}} extends {{this}}{{/baseType}} {
    {{#each Property}}
    {{getPropertyName $}}{{strictAssertion $}}: {{$.typeName}}{{nonNullDefault $}};
    {{/each}}
    {{#each NavigationProperty}}
    {{getPropertyName $}}{{strictAssertion $}}: {{$.typeName}}{{nonNullNavDefault $}};
    {{/each}}
}`;

const exportsTemplate =
`/* This code was generated by {{description}} v{{version}} */
/* tslint:disable */
{{#exports}}export { {{typeName}} } from './{{moduleName}}';
{{/exports}}`;
