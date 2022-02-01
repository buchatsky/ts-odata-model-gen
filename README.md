# ts-odata-model-gen
Typescript OData model generator for OData v4 services.<br/>
Produces Entity types, Complex types and Enums (each in a separate file) from the $metadata endpoint.<br/>
Inspired by [jin-qu/jinqu-odata-cli](https://github.com/jin-qu/jinqu-odata-cli) and [Breeze/breeze.tooling](https://github.com/Breeze/breeze.tooling)


Usage: ts-odata-model-gen \[options\]<br/>

Options:<br/>
  -V, --version              output the version number<br/>
  -u, --url <odata url>      OData service url<br/>
  -o, --outDir <output dir>  Output directory (default: "models")<br/>
  -i, --useInterfaces        Use interfaces for entity types<br/>
  -n, --nonNullAssertions    Use non-null property assertions<br/>
  -c, --camelCaseProps       Use camelCase property names<br/>
  -k, --kebabCaseModules     Use kebab-case module names<br/>
  -h, --help                 display help for command<br/>
 
Example:<br/>
`node ts-odata-model-gen --url https://localhost:5001/odata --outDir models --camelCaseProps --kebabCaseModules`
