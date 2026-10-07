import { BadRequestException, Injectable } from '@nestjs/common';
import { VariantKind } from '@prisma/client';
import bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

const PT_PER_MM = 72 / 25.4;
export const MAX_LABELS_PER_JOB = 2000;

export interface LabelRequest {
  variantId: string;
  copies: number;
}

interface LabelContent {
  title: string;
  subtitle: string | null;
  code: string;
  price: string | null;
}

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Builds a PDF with one label per page, sized for a label printer.
   * A kit expands to labels for each of its boxes (copies × boxes per kit).
   */
  async productLabels(requests: LabelRequest[]): Promise<Buffer> {
    const settings = await this.settings.getAll();
    const money = new Intl.NumberFormat('en-MT', { style: 'currency', currency: settings.currency });

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: requests.map((r) => r.variantId) } },
      include: {
        product: { select: { name: true } },
        components: { include: { componentVariant: true } },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    const labels: { content: LabelContent; copies: number }[] = [];
    for (const req of requests) {
      const v = byId.get(req.variantId);
      if (!v) throw new BadRequestException('One of the selected items no longer exists');

      if (v.kind === VariantKind.KIT) {
        for (const part of v.components) {
          const c = part.componentVariant;
          if (!c.active) continue;
          labels.push({
            content: { title: v.product.name, subtitle: c.name, code: c.code, price: null },
            copies: req.copies * part.quantity,
          });
        }
      } else {
        labels.push({
          content: {
            title: v.product.name,
            subtitle: v.name === 'Default' ? null : v.name,
            code: v.code,
            price:
              settings.labelShowPrice && v.kind === VariantKind.STANDARD && v.price
                ? money.format(Number(v.price))
                : null,
          },
          copies: req.copies,
        });
      }
    }

    const total = labels.reduce((sum, l) => sum + l.copies, 0);
    if (total === 0) throw new BadRequestException('Nothing to print');
    if (total > MAX_LABELS_PER_JOB) {
      throw new BadRequestException(`That is ${total} labels — print at most ${MAX_LABELS_PER_JOB} at a time`);
    }

    return renderPdf(labels, settings.labelWidthMm, settings.labelHeightMm);
  }
}

async function renderPdf(
  labels: { content: LabelContent; copies: number }[],
  widthMm: number,
  heightMm: number,
): Promise<Buffer> {
  const width = widthMm * PT_PER_MM;
  const height = heightMm * PT_PER_MM;
  const pad = 1.5 * PT_PER_MM;
  const inner = width - pad * 2;

  const doc = new PDFDocument({ size: [width, height], margin: 0, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Barcode images are identical for every copy, so render each once.
  const images = new Map<string, Buffer>();
  for (const { content } of labels) {
    if (!images.has(content.code)) {
      images.set(
        content.code,
        await bwipjs.toBuffer({ bcid: 'code128', text: content.code, scale: 4, height: 12, includetext: false }),
      );
    }
  }

  const titleSize = Math.min(8, height / 9);
  const smallSize = Math.min(7, height / 11);

  for (const { content, copies } of labels) {
    for (let i = 0; i < copies; i++) {
      doc.addPage({ size: [width, height], margin: 0 });
      let y = pad;

      doc.font('Helvetica-Bold').fontSize(titleSize);
      doc.text(content.title, pad, y, { width: inner, height: titleSize * 1.2, lineBreak: false, ellipsis: true });
      y += titleSize * 1.15;

      const sub = [content.subtitle, content.price].filter(Boolean).join('   ');
      if (sub) {
        doc.font('Helvetica').fontSize(smallSize);
        doc.text(sub, pad, y, { width: inner, height: smallSize * 1.2, lineBreak: false, ellipsis: true });
        y += smallSize * 1.15;
      }

      // Scanners need a blank "quiet zone" either side of the bars.
      const quiet = 3 * PT_PER_MM;
      const codeHeight = smallSize * 1.3;
      const barcodeHeight = height - y - pad - codeHeight;
      doc.image(images.get(content.code)!, quiet, y + 1, {
        fit: [width - quiet * 2, barcodeHeight - 1],
        align: 'center',
      });

      doc.font('Helvetica').fontSize(smallSize);
      doc.text(content.code, pad, height - pad - smallSize, { width: inner, align: 'center', lineBreak: false });
    }
  }

  doc.end();
  return done;
}
