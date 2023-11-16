# ts-odata-model-gen
Typescript OData model generator for OData v4 services.<br/>
Produces Entity types, Complex types and Enums (each in a separate file) from the $metadata endpoint.<br/>
Inspired by [jin-qu/jinqu-odata-cli](https://github.com/jin-qu/jinqu-odata-cli) and [Breeze/breeze.tooling](https://github.com/Breeze/breeze.tooling)


Usage: ts-odata-model-gen \[options\]<br/>

Options:<br/>
<table>
<tr><td>-V, --version</td><td>                     output the version number</td></tr>
<tr><td>-u, --url <odata_url></td><td>             OData service url</td></tr>
<tr><td>-o, --outDir <output_dir></td><td>         output directory (default: "models")</td></tr>
<tr><td>-b, --baseType <class|interface></td><td>  base type for entity types</td></tr>
<tr><td>-f, --useInterfaces</td><td>               use interfaces instead of classes</td></tr>
<tr><td>-s, --strictNullability</td><td>           use strict nullability assertions for properties</td></tr>
<tr><td>-i, --initNonNullProps</td><td>            use initializers for non-nullable properties</td></tr>
<tr><td>-c, --camelCaseProps</td><td>              use camelCase property names</td></tr>
<tr><td>-k, --kebabCaseModules</td><td>            use kebab-case module names</td></tr>
<tr><td>-d, --useDateProps</td><td>                use Date type for date/time properties</td></tr>
<tr><td>--ignoreCertErrors</td><td>                ignore SSL/TLS certificate errors</td></tr>
<tr><td>-h, --help</td><td>                        display help for command</td></tr>
</table>
  
Example:<br/>
`ts-odata-model-gen --url https://localhost:5001/odata --outDir models --strictNullability --camelCaseProps --kebabCaseModules`
