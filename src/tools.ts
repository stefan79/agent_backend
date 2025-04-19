import { StructuredToolInterface } from "@langchain/core/tools";

export const generateToolGuidance = (tools: StructuredToolInterface[]) => tools.map(tool => {
    let guidance = `${tool.name}: ${tool.description}`;
    
    try {
      if (tool.schema) {
        const schema = tool.schema;
        
        if ('properties' in schema && typeof schema.properties === 'object') {
          guidance += `\nInput format: `;
          Object.entries(schema.properties).forEach(entry => {
            const [key, details] = entry
            if ('type' in details) {
              guidance += `${key} typeOf: ${details.type} `
            }
          })
        }
      }
    } catch (e) {
      guidance += '\nSchema unavailable';
    }
    return guidance;
  }).join('\n\n');