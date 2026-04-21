import type { Parser } from '../parser.js';
import { pageParser } from './page.js';
import { textParser } from './text.js';
import {
  heading1Parser, heading2Parser, heading3Parser, heading4Parser, heading5Parser, heading6Parser, heading7Parser,
  heading8Parser, heading9Parser,
} from './heading.js';
import { bulletParser } from './bullet.js';
import { orderedParser } from './ordered.js';
import { codeParser } from './code.js';
import { quoteParser } from './quote.js';
import { equationParser } from './equation.js';
import { todoParser } from './todo.js';
import { calloutParser } from './callout.js';
import { dividerParser } from './divider.js';
import { gridParser } from './grid.js';
import { imageParser } from './image.js';
import { tableParser } from './table.js';
import { quoteContainerParser } from './quoteContainer.js';
import { whiteboardParser } from './whiteboard.js';

export function registerBuiltinParsers (parser: Parser): void {
  parser.register(pageParser);
  parser.register(textParser);
  parser.register(heading1Parser);
  parser.register(heading2Parser);
  parser.register(heading3Parser);
  parser.register(heading4Parser);
  parser.register(heading5Parser);
  parser.register(heading6Parser);
  parser.register(heading7Parser);
  parser.register(heading8Parser);
  parser.register(heading9Parser);
  parser.register(bulletParser);
  parser.register(orderedParser);
  parser.register(codeParser);
  parser.register(quoteParser);
  parser.register(equationParser);
  parser.register(todoParser);
  parser.register(calloutParser);
  parser.register(dividerParser);
  parser.register(gridParser);
  parser.register(imageParser);
  parser.register(tableParser);
  parser.register(quoteContainerParser);
  parser.register(whiteboardParser);
}
