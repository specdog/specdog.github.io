from __future__ import annotations

import argparse
import hashlib
import html
import re
from pathlib import Path

from markdown_it import MarkdownIt
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Preformatted, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[2]
INK = colors.HexColor('#15283A')
ACCENT = colors.HexColor('#166C75')
MUTED = colors.HexColor('#5D6975')
LINE = colors.HexColor('#D9E0E6')
WIDTH = A4[0] - 112


def setup_fonts(directory: Path | None) -> None:
    files = {
        'Body': 'Times New Roman.ttf',
        'BodyBold': 'Times New Roman Bold.ttf',
        'BodyItalic': 'Times New Roman Italic.ttf',
        'Sans': 'Arial.ttf',
        'SansBold': 'Arial Bold.ttf',
    }
    if directory is None:
        directory = Path('/System/Library/Fonts/Supplemental')
    if all((directory / file).exists() for file in files.values()):
        for name, file in files.items():
            pdfmetrics.registerFont(TTFont(name, str(directory / file)))
        pdfmetrics.registerFontFamily('Body', normal='Body', bold='BodyBold', italic='BodyItalic', boldItalic='BodyBold')
        pdfmetrics.registerFontFamily('Sans', normal='Sans', bold='SansBold', italic='Sans', boldItalic='SansBold')
    else:
        for name, base in [('Body', 'Times-Roman'), ('BodyBold', 'Times-Bold'), ('BodyItalic', 'Times-Italic'), ('Sans', 'Helvetica'), ('SansBold', 'Helvetica-Bold')]:
            pdfmetrics.registerFont(pdfmetrics.Font(name, base, 'WinAnsiEncoding'))
        pdfmetrics.registerFontFamily('Body', normal='Body', bold='BodyBold', italic='BodyItalic', boldItalic='BodyBold')
        pdfmetrics.registerFontFamily('Sans', normal='Sans', bold='SansBold', italic='Sans', boldItalic='SansBold')


def inline(children) -> str:
    result = []
    for token in children or []:
        if token.type == 'text':
            text = html.escape(token.content)
            text = re.sub(r'\[(\d+)\]', r'<link href="#ref\1" color="#166C75">[\1]</link>', text)
            result.append(text)
        elif token.type == 'code_inline':
            result.append(f'<font name="Courier" size="8.8">{html.escape(token.content)}</font>')
        elif token.type in ('strong_open', 'strong_close', 'em_open', 'em_close'):
            tag = 'b' if token.type.startswith('strong') else 'i'
            result.append(f'</{tag}>' if token.type.endswith('close') else f'<{tag}>')
        elif token.type == 'link_open':
            result.append(f'<link href="{html.escape(token.attrGet("href"), quote=True)}" color="#166C75">')
        elif token.type == 'link_close':
            result.append('</link>')
        elif token.type in ('softbreak', 'hardbreak'):
            result.append(' ' if token.type == 'softbreak' else '<br/>')
    return ''.join(result)


class EvidenceDiagram(Flowable):
    def __init__(self, source):
        super().__init__()
        self.labels = [label for _, label in re.findall(r'(\w+)\[([^\]]+)\]', source)]
        self.width = WIDTH
        self.height = 153

    def draw(self):
        canvas = self.canv
        boxes = [(0, 92), (169, 92), (338, 92), (338, 21), (169, 21), (0, 21)]
        box_width = 145
        canvas.setStrokeColor(LINE)
        canvas.setFillColor(colors.HexColor('#F1F6F7'))
        for (x, y), label in zip(boxes, self.labels):
            canvas.roundRect(x, y, box_width, 39, 5, stroke=1, fill=1)
            canvas.setFillColor(INK)
            canvas.setFont('Sans', 9)
            canvas.drawCentredString(x + box_width / 2, y + 15, label)
            canvas.setFillColor(colors.HexColor('#F1F6F7'))
        canvas.setStrokeColor(ACCENT)
        canvas.setFillColor(ACCENT)
        for index in range(5):
            x1, y1 = boxes[index]
            x2, y2 = boxes[index + 1]
            if index == 2:
                start, end = (x1 + 72.5, y1), (x2 + 72.5, y2 + 39)
                triangle = [(end[0] - 3, end[1] + 5), (end[0] + 3, end[1] + 5), end]
            elif index < 2:
                start, end = (x1 + box_width, y1 + 19.5), (x2, y2 + 19.5)
                triangle = [(end[0] - 5, end[1] - 3), (end[0] - 5, end[1] + 3), end]
            else:
                start, end = (x1, y1 + 19.5), (x2 + box_width, y2 + 19.5)
                triangle = [(end[0] + 5, end[1] - 3), (end[0] + 5, end[1] + 3), end]
            canvas.line(*start, *end)
            path = canvas.beginPath()
            path.moveTo(*triangle[0])
            for point in triangle[1:]:
                path.lineTo(*point)
            path.close()
            canvas.drawPath(path, stroke=0, fill=1)


class ThesisDocument(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == 'Chapter':
            title = flowable.getPlainText()
            key = 'chapter-' + hashlib.sha256(title.encode()).hexdigest()[:12]
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(title, key, 0)
            self.notify('TOCEntry', (0, title, self.page, key))


def build(source: Path, output: Path, font_directory: Path | None) -> None:
    setup_fonts(font_directory)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='BodyTextThesis', fontName='Body', fontSize=10.7, leading=15.3, alignment=TA_JUSTIFY, spaceAfter=7, textColor=INK))
    styles.add(ParagraphStyle(name='Chapter', fontName='SansBold', fontSize=18, leading=23, textColor=INK, spaceAfter=18, keepWithNext=True))
    styles.add(ParagraphStyle(name='Subsection', fontName='SansBold', fontSize=11.2, leading=15, textColor=ACCENT, spaceBefore=12, spaceAfter=7, keepWithNext=True))
    styles.add(ParagraphStyle(name='CoverTitle', fontName='SansBold', fontSize=29, leading=35, textColor=INK, spaceAfter=22))
    styles.add(ParagraphStyle(name='CoverSubtitle', fontName='Sans', fontSize=15, leading=21, textColor=ACCENT, spaceAfter=20))
    styles.add(ParagraphStyle(name='Small', fontName='Sans', fontSize=9.2, leading=13, textColor=MUTED, spaceAfter=10))
    styles.add(ParagraphStyle(name='Cell', fontName='Sans', fontSize=8.4, leading=11.4, textColor=INK))
    styles.add(ParagraphStyle(name='CellHead', fontName='SansBold', fontSize=8.6, leading=11.5, textColor=INK))
    styles.add(ParagraphStyle(name='Reference', fontName='Body', fontSize=9.3, leading=13, textColor=INK, spaceAfter=10, splitLongWords=True))
    styles.add(ParagraphStyle(name='CodeThesis', fontName='Courier', fontSize=8, leading=11, backColor=colors.HexColor('#F3F5F7'), borderPadding=10, spaceBefore=6, spaceAfter=10))
    styles.add(ParagraphStyle(name='TOCThesis', fontName='Sans', fontSize=10.2, leading=16, textColor=INK, leftIndent=0, firstLineIndent=0, spaceBefore=5))

    def page(canvas, doc):
        if doc.page == 1:
            return
        canvas.saveState()
        canvas.setFont('Sans', 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(56, A4[1] - 34, 'DOTDOG  /  EVIDENCE-LINKED TYPE-DRIVEN DESIGN')
        canvas.setStrokeColor(LINE)
        canvas.line(56, A4[1] - 43, A4[0] - 56, A4[1] - 43)
        canvas.drawString(56, 29, 'Applied research thesis | 31 October 2026')
        canvas.drawRightString(A4[0] - 56, 29, str(doc.page))
        canvas.restoreState()

    output.parent.mkdir(parents=True, exist_ok=True)
    document = ThesisDocument(str(output), pagesize=A4, leftMargin=56, rightMargin=56, topMargin=65, bottomMargin=50, title='Type-Driven Design as Evidence-Linked Engineering', author='Prepared for Specdog', subject='Applied technical thesis on Dotdog use cases and tested evidence')
    frame = Frame(56, 50, WIDTH, A4[1] - 115, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    document.addPageTemplates(PageTemplate(id='thesis', frames=frame, onPage=page))
    story = [Spacer(1, 77), Paragraph('SPECDOG  /  APPLIED RESEARCH', styles['Small']), Spacer(1, 22), Paragraph('Type-Driven Design<br/>as Evidence-Linked<br/>Engineering', styles['CoverTitle']), Paragraph('A practical thesis for Dotdog', styles['CoverSubtitle']), Spacer(1, 28), Paragraph('How specifications, types, checks, and graphs can support real maintenance workflows without confusing relationships with proof.', styles['BodyTextThesis']), Spacer(1, 34), Paragraph('Prepared for Specdog<br/>Research cutoff: 31 October 2026', styles['Small']), Spacer(1, 20), Paragraph('Technical research, measured prototypes, and a bounded adoption proposal. Not a released Dotdog feature or a peer-reviewed result.', styles['Small']), PageBreak(), Paragraph('Contents', styles['CoverSubtitle'])]
    toc = TableOfContents()
    toc.levelStyles = [styles['TOCThesis']]
    story += [toc]

    tokens = MarkdownIt('commonmark').enable('table').parse(source.read_text())
    active = False
    references = False
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token.type == 'heading_open':
            content = tokens[index + 1]
            if token.tag == 'h2' and content.content == 'Abstract':
                active = True
            if active:
                if token.tag == 'h2':
                    story += [PageBreak(), Paragraph(inline(content.children), styles['Chapter'])]
                    references = content.content == 'References'
                else:
                    story.append(Paragraph(inline(content.children), styles['Subsection']))
            index += 3
            continue
        if not active:
            index += 1
            continue
        if token.type == 'paragraph_open':
            content = tokens[index + 1]
            if references:
                match = re.match(r'\[(\d+)\]\s+(.*?)\s+(https?://\S+)$', content.content)
                if not match:
                    raise ValueError('Malformed reference: ' + content.content)
                number, label, url = match.groups()
                text = f'<a name="ref{number}"/><b>[{number}]</b> {html.escape(label)}<br/><font name="Sans" size="8"><link href="{html.escape(url, quote=True)}" color="#166C75">{html.escape(url)}</link></font>'
                story.append(Paragraph(text, styles['Reference']))
            else:
                story.append(Paragraph(inline(content.children), styles['BodyTextThesis']))
            index += 3
            continue
        if token.type in ('bullet_list_open', 'ordered_list_open'):
            ordinal = int(token.attrGet('start') or 1)
            ordered = token.type == 'ordered_list_open'
            index += 1
            while index < len(tokens) and tokens[index].type not in ('bullet_list_close', 'ordered_list_close'):
                if tokens[index].type == 'inline':
                    prefix = f'{ordinal}. ' if ordered else '- '
                    story.append(Paragraph(prefix + inline(tokens[index].children), styles['BodyTextThesis']))
                    ordinal += 1
                index += 1
            index += 1
            continue
        if token.type == 'table_open':
            rows, row = [], []
            header = False
            index += 1
            while tokens[index].type != 'table_close':
                current = tokens[index]
                if current.type == 'thead_open':
                    header = True
                elif current.type == 'thead_close':
                    header = False
                elif current.type == 'tr_open':
                    row = []
                elif current.type == 'inline':
                    row.append(Paragraph(inline(current.children), styles['CellHead' if header else 'Cell']))
                elif current.type == 'tr_close':
                    rows.append(row)
                index += 1
            widths = [WIDTH / len(rows[0])] * len(rows[0])
            if len(widths) == 3:
                widths = [WIDTH * .48, WIDTH * .2, WIDTH * .32]
            table = Table(rows, colWidths=widths, repeatRows=1, hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E9F1F3')), ('LINEBELOW', (0, 0), (-1, 0), .8, ACCENT), ('LINEBELOW', (0, 1), (-1, -1), .35, LINE), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
            story += [Spacer(1, 6), table, Spacer(1, 12)]
            index += 1
            continue
        if token.type == 'fence':
            if token.info.strip() == 'mermaid':
                story.append(KeepTogether([EvidenceDiagram(token.content), Paragraph('Figure 1. A navigable evidence path. Each arrow records a relationship, not a proof.', styles['Small'])]))
            else:
                story.append(Preformatted(token.content, styles['CodeThesis']))
        index += 1
    document.multiBuild(story)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=ROOT / 'docs/dotdog-type-driven-design-thesis.md')
    parser.add_argument('--output', type=Path, default=ROOT / 'output/pdf/dotdog-type-driven-design-thesis.pdf')
    parser.add_argument('--font-dir', type=Path)
    args = parser.parse_args()
    build(args.source, args.output, args.font_dir)
