# ts-odata-model-gen
Typescript OData model generator for OData v4 services.<br/>
Produces Entity types, Complex types and Enums (each in a separate file) from the $metadata endpoint.<br/>
Inspired by [jin-qu/jinqu-odata-cli](https://github.com/jin-qu/jinqu-odata-cli) and [Breeze/breeze.tooling](https://github.com/Breeze/breeze.tooling)


Usage: ts-odata-model-gen \[options\]<br/>

Options:<br/>
  -V, --version                     output the version number<br/>
  -u, --url <odata_url>             OData service url<br/>
  -o, --outDir <output_dir>         output directory (default: "models")<br/>
  -b, --baseType <class|interface>  base type for entity types<br/>
  -f, --useInterfaces               use interfaces instead of classes<br/>
  -s, --strictNullability           use strict nullability assertions for properties<br/>
  -i, --initNonNullProps            use initializers for non-nullable properties<br/>
  -c, --camelCaseProps              use camelCase property names<br/>
  -k, --kebabCaseModules            use kebab-case module names<br/>
  -h, --help                        display help for command<br/>
  
Example:<br/>
`node ts-odata-model-gen --url https://localhost:5001/odata --outDir models --strictNullability --camelCaseProps --kebabCaseModules`
