import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { Document, Packer, Paragraph } from 'docx';
import ExcelJS from 'exceljs';
import { PDFDocument as SecurePDFDocument } from 'pdf-lib-plus-encrypt';

const temp = path.resolve('tmp-engine-test');
fs.mkdirSync(temp, { recursive: true });

const source = await PDFDocument.create();
source.addPage([300, 300]).drawText('PDFly engine test', { x: 30, y: 250 });
const sourceBytes = await source.save();
const secure=await SecurePDFDocument.load(sourceBytes);await secure.encrypt({userPassword:'teste123',ownerPassword:'owner123'});const protectedBytes=await secure.save();if(!protectedBytes.length)throw new Error('PDF encryption test failed');

const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('PDFly DOCX test')] }] }));
if (!docx.length) throw new Error('DOCX generation test failed');

const workbook = new ExcelJS.Workbook();
workbook.addWorksheet('Teste').addRow(['PDFly', 'XLSX test']);
const xlsxBytes = await workbook.xlsx.writeBuffer();
if (!xlsxBytes.length) throw new Error('XLSX generation test failed');

console.log(JSON.stringify({ pdf: sourceBytes.length, encryption:protectedBytes.length, docx: docx.length, xlsx: xlsxBytes.length }));
