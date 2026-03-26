import React, { useState, useRef, useEffect } from 'react';
import * as mammoth from 'mammoth';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  BorderStyle,
} from 'docx';
import { saveAs } from 'file-saver';
import {
  Upload,
  Save,
  FolderOpen,
  Download,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  FileText,
} from 'lucide-react';

// --- Types ---

type Chunk = {
  id: string;
  heading: string;
  contentHtml: string;
  notes: string;
  scrollPosition?: number;
};

type GlobalScores = {
  idmSectorFocus: number;
  executionCapability: number;
  impactAdditionality: number;
  kpiAlignment: number;
  responsibleAi: number;
  diversityInclusion: number;
  readinessType: 'commercialization' | 'adoption' | null;
  readinessCommercialization: number;
  readinessAdoption: number;
  budgetAndValue: number;
};

// --- Constants ---

const INITIAL_SCORES: GlobalScores = {
  idmSectorFocus: 0,
  executionCapability: 0,
  impactAdditionality: 0,
  kpiAlignment: 0,
  responsibleAi: 0,
  diversityInclusion: 0,
  readinessType: null,
  readinessCommercialization: 0,
  readinessAdoption: 0,
  budgetAndValue: 0,
};

const CRITERIA = [
  {
    id: 'idmSectorFocus',
    label: '1. IDM Sector Focus & Relevance',
    max: 20,
    tooltip:
      "How clearly the project fits within Manitoba's Interactive Digital Media sector (video games, XR, interactive web/apps, education, etc.) and contributes to sector growth, innovation, and competitiveness. Evidence of Manitoba roots, IDM collaboration, or spillover benefits.",
  },
  {
    id: 'executionCapability',
    label: '2. Execution Capability & Readiness',
    max: 20,
    tooltip:
      'Team experience, partner capacity, milestone realism (to Dec 31, 2027), quotes, resources, and risk management. Demonstrated ability to deliver as planned.',
  },
  {
    id: 'impactAdditionality',
    label: '3. Impact & Additionality',
    max: 20,
    tooltip:
      'Magnitude and likelihood of benefits directly attributable to NMM support (jobs, sales, productivity, competitiveness). Broader ecosystem impact and sustainability beyond funding.',
  },
  {
    id: 'kpiAlignment',
    label: '4. KPI Alignment & Measurability',
    max: 15,
    tooltip:
      'Strength, clarity, and credibility of KPIs (HQP/non-HQP jobs, revenue/export growth, AI tech to market, R&D spend). Baselines, assumptions, and tracking methods should be realistic and measurable.',
  },
  {
    id: 'responsibleAi',
    label: '5. Responsible AI & Data Governance',
    max: 10,
    tooltip:
      'Readiness to comply with AI ethics and regulatory standards (Bill C-27, CPPA, AIDA, PIPEDA). Clear understanding of privacy, security, and model governance.',
  },
  {
    id: 'diversityInclusion',
    label: '6. Diversity, Inclusion & Ecosystem Benefits',
    max: 5,
    tooltip:
      'Your company is Indigenous-led, rural/remote, or the benefits of this AI project lead to training for youth/women.',
  },
  {
    id: 'budgetAndValue',
    label: '8. Budget Quality & Value for Money',
    max: 5,
    tooltip:
      'Eligible, reasonable, and justified costs tied to AI adoption or commercialization. \u226550% company cash match confirmed. Cost-effectiveness per expected outcome.',
  },
];

// Matches "SECTION N — TITLE" pattern used in NMM EOI forms,
// plus legacy plain-name headings as fallback
const SECTION_HEADING_REGEX =
  /^section\s+\d+\s*[—–\-:]\s*.+$/i;

const LEGACY_SECTIONS = [
  'applicant information',
  'application information',
  'contacts',
  'project details',
  'project budget',
  'declaration',
];

// --- Main Component ---

export default function App() {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [scores, setScores] = useState<GlobalScores>(INITIAL_SCORES);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reviewer, setReviewer] = useState('');
  const [otherReviewer, setOtherReviewer] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const readerScrollRef = useRef<HTMLDivElement>(null);

  const currentChunk = chunks[currentChunkIndex];

  // Restore scroll position when navigating between chunks
  useEffect(() => {
    if (readerScrollRef.current && chunks.length > 0) {
      readerScrollRef.current.scrollTop =
        chunks[currentChunkIndex].scrollPosition || 0;
    }
  }, [currentChunkIndex, chunks]);

  const handleNavigate = (newIndex: number) => {
    if (readerScrollRef.current) {
      const newChunks = [...chunks];
      newChunks[currentChunkIndex].scrollPosition =
        readerScrollRef.current.scrollTop;
      setChunks(newChunks);
    }
    setCurrentChunkIndex(newIndex);
  };

  // Parse uploaded .docx into section chunks via mammoth
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const newChunks: Chunk[] = [];
    let currentChunkData: Chunk = {
      id: crypto.randomUUID(),
      heading: 'Introduction',
      contentHtml: '',
      notes: '',
    };

    const isSectionHeading = (text: string): boolean => {
      // Match "SECTION 1 — COMPANY INFORMATION" style
      if (SECTION_HEADING_REGEX.test(text)) return true;
      // Fallback: match legacy plain headings
      return LEGACY_SECTIONS.some((section) => {
        const regex = new RegExp(`^(\\d+\\.\\s*)?${section}\\s*:?$`, 'i');
        return regex.test(text);
      });
    };

    const cleanHeadingText = (text: string): string => {
      // "SECTION 1 — COMPANY INFORMATION" → "Company Information"
      const sectionMatch = text.match(
        /^section\s+\d+\s*[—–\-:]\s*(.+)$/i,
      );
      if (sectionMatch) {
        return sectionMatch[1].trim();
      }
      return text
        .replace(/^\d+\.\s*/, '')
        .replace(/:$/, '')
        .trim();
    };

    const processNode = (node: ChildNode) => {
      const text = node.textContent?.replace(/\s+/g, ' ').trim() || '';

      if (isSectionHeading(text)) {
        if (
          currentChunkData.contentHtml.trim() ||
          currentChunkData.heading !== 'Introduction'
        ) {
          newChunks.push(currentChunkData);
        }
        currentChunkData = {
          id: crypto.randomUUID(),
          heading: cleanHeadingText(text),
          contentHtml: '',
          notes: '',
        };
      } else {
        if (node.nodeType === Node.ELEMENT_NODE) {
          currentChunkData.contentHtml += (node as Element).outerHTML;
        } else if (node.nodeType === Node.TEXT_NODE) {
          currentChunkData.contentHtml += node.textContent;
        }
      }
    };

    Array.from(doc.body.childNodes).forEach(processNode);
    if (currentChunkData.contentHtml.trim() || newChunks.length === 0) {
      newChunks.push(currentChunkData);
    }

    setChunks(newChunks);
    setCurrentChunkIndex(0);
    setScores(INITIAL_SCORES);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newChunks = [...chunks];
    newChunks[currentChunkIndex].notes = e.target.value;
    setChunks(newChunks);
  };

  const handleScoreChange = (
    id: keyof GlobalScores,
    value: number | string | null,
  ) => {
    setScores((prev) => ({ ...prev, [id]: value }));
  };

  const calculateTotalScore = () => {
    let total = 0;
    CRITERIA.forEach((c) => {
      total += (scores[c.id as keyof GlobalScores] as number) || 0;
    });
    if (scores.readinessType === 'commercialization') {
      total += scores.readinessCommercialization || 0;
    } else if (scores.readinessType === 'adoption') {
      total += scores.readinessAdoption || 0;
    }
    return total;
  };

  // Download current state as JSON for later resumption
  const saveSession = () => {
    const sessionData = { fileName, chunks, scores };
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
      type: 'application/json',
    });
    saveAs(blob, 'eoi_review_session.json');
  };

  // Restore state from a previously saved JSON session file
  const loadSession = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.chunks && data.scores) {
          setChunks(data.chunks);
          setScores(data.scores);
          setFileName(data.fileName || 'Loaded Session');
          setCurrentChunkIndex(0);
        } else {
          alert('Invalid session file format.');
        }
      } catch {
        alert('Error parsing session file.');
      }
    };
    reader.readAsText(file);
    if (loadInputRef.current) loadInputRef.current.value = '';
  };

  // Build and download a .docx review report
  const generateReport = async (reviewerName: string) => {
    const tableRows = [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Criteria', bold: true })],
              }),
            ],
            width: { size: 70, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Score', bold: true })],
              }),
            ],
            width: { size: 30, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
      ...CRITERIA.map(
        (c) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(c.label)] }),
              new TableCell({
                children: [
                  new Paragraph(
                    `${scores[c.id as keyof GlobalScores]} / ${c.max}`,
                  ),
                ],
              }),
            ],
          }),
      ),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph('7a. Commercialization Readiness')],
          }),
          new TableCell({
            children: [
              new Paragraph(
                scores.readinessType === 'commercialization'
                  ? `${scores.readinessCommercialization} / 5`
                  : 'N/A',
              ),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph('7b. Adoption Readiness')],
          }),
          new TableCell({
            children: [
              new Paragraph(
                scores.readinessType === 'adoption'
                  ? `${scores.readinessAdoption} / 5`
                  : 'N/A',
              ),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Total Score', bold: true })],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${calculateTotalScore()} / 100`,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ];

    const narrativeParagraphs: Paragraph[] = [];
    chunks.forEach((chunk) => {
      if (chunk.notes.trim()) {
        narrativeParagraphs.push(
          new Paragraph({ text: chunk.heading, heading: HeadingLevel.HEADING_2 }),
        );
        narrativeParagraphs.push(new Paragraph({ text: chunk.notes }));
        narrativeParagraphs.push(new Paragraph({ text: '' }));
      }
    });

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: 'EOI Project Review Report',
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({ text: `File: ${fileName || 'Unknown'}` }),
            new Paragraph({ text: `Reviewer: ${reviewerName}` }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'Summary Scores',
              heading: HeadingLevel.HEADING_2,
            }),
            new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
                insideVertical: { style: BorderStyle.SINGLE, size: 1 },
              },
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              text: 'Reviewer Notes',
              heading: HeadingLevel.HEADING_1,
            }),
            ...narrativeParagraphs,
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'eoi_review_report.docx');
  };

  // --- Render ---

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 leading-tight">
              EOI Project Review
            </h1>
            <p className="text-sm text-slate-500">
              {fileName ? fileName : 'No document loaded'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".docx"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <Upload className="w-4 h-4" /> Import Word Doc
          </button>

          <div className="w-px h-6 bg-slate-200 mx-1"></div>

          <button
            onClick={saveSession}
            disabled={chunks.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" /> Save Session
          </button>

          <input
            type="file"
            accept=".json"
            className="hidden"
            ref={loadInputRef}
            onChange={loadSession}
          />
          <button
            onClick={() => loadInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <FolderOpen className="w-4 h-4" /> Load Session
          </button>

          <div className="w-px h-6 bg-slate-200 mx-1"></div>

          <button
            onClick={() => setIsReportModalOpen(true)}
            disabled={chunks.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Download className="w-4 h-4" /> Generate Report
          </button>
        </div>
      </header>

      {/* Main Content */}
      {chunks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <Upload className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-medium text-slate-700 mb-2">
            No Document Loaded
          </h2>
          <p className="max-w-md text-center mb-6">
            Import a Word document (.docx) to begin grading. The document will
            be automatically split into sections based on headings.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Select Document
          </button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Document Reader */}
          <div className="w-1/3 flex flex-col border-r border-slate-200 bg-white">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h2 className="font-medium text-slate-700 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">
                  {currentChunkIndex + 1} / {chunks.length}
                </span>
                Document Reader
              </h2>
            </div>

            <div ref={readerScrollRef} className="flex-1 overflow-y-auto p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-6 pb-2 border-b border-slate-100">
                {currentChunk?.heading}
              </h2>
              <div
                className="text-base leading-relaxed text-slate-700 [&_p]:mb-5 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-5 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-5 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-5 [&_li]:mb-2 [&_table]:w-full [&_table]:mb-6 [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:p-3 [&_td]:align-top [&_th]:border [&_th]:border-slate-200 [&_th]:p-3 [&_th]:bg-slate-50 [&_th]:text-left [&_strong]:font-semibold [&_strong]:text-slate-900"
                dangerouslySetInnerHTML={{
                  __html:
                    currentChunk?.contentHtml ||
                    '<p class="text-slate-400 italic">No content in this section.</p>',
                }}
              />
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <button
                onClick={() =>
                  handleNavigate(Math.max(0, currentChunkIndex - 1))
                }
                disabled={currentChunkIndex === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <button
                onClick={() =>
                  handleNavigate(
                    Math.min(chunks.length - 1, currentChunkIndex + 1),
                  )
                }
                disabled={currentChunkIndex === chunks.length - 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Middle Column: Notes */}
          <div className="w-1/3 flex flex-col border-r border-slate-200 bg-white">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="font-medium text-slate-700">Notes & Comments</h2>
              <p className="text-xs text-slate-500 mt-1">
                Specific to: {currentChunk?.heading}
              </p>
            </div>
            <div className="flex-1 p-4 flex flex-col">
              <textarea
                value={currentChunk?.notes || ''}
                onChange={handleNoteChange}
                placeholder="Enter your review notes for this section here..."
                className="flex-1 w-full resize-none rounded-lg border border-slate-200 p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700 leading-relaxed shadow-sm"
              />
            </div>
          </div>

          {/* Right Column: Universal Scoring */}
          <div className="w-1/3 flex flex-col bg-slate-50">
            <div className="p-6 border-b border-slate-200 bg-white shadow-sm flex justify-between items-end shrink-0 z-10">
              <div>
                <h2 className="font-semibold text-slate-900 text-lg">
                  Universal Scoring
                </h2>
                <p className="text-sm text-slate-500">
                  Persists across all sections
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-indigo-600 tracking-tight">
                  {calculateTotalScore()}{' '}
                  <span className="text-lg text-slate-400 font-medium">
                    / 100
                  </span>
                </div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">
                  Total Score
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {CRITERIA.map((criteria) => (
                <div key={criteria.id} className="space-y-3">
                  <div className="flex justify-between items-center relative group z-10 hover:z-50">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 cursor-help">
                      {criteria.label}
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    </label>
                    <span className="text-sm font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm min-w-[3rem] text-center">
                      {(scores[criteria.id as keyof GlobalScores] as number) ||
                        0}
                    </span>

                    {/* Tooltip */}
                    <div className="absolute left-0 top-full mt-2 w-full p-3 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none leading-relaxed">
                      {criteria.tooltip}
                      <div className="absolute left-6 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-slate-800"></div>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={criteria.max}
                    value={
                      (scores[criteria.id as keyof GlobalScores] as number) || 0
                    }
                    onChange={(e) =>
                      handleScoreChange(
                        criteria.id as keyof GlobalScores,
                        parseInt(e.target.value),
                      )
                    }
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <div className="flex justify-between text-xs text-slate-400 font-medium">
                    <span>0</span>
                    <span>{criteria.max}</span>
                  </div>
                </div>
              ))}

              {/* Readiness Section (Mutually Exclusive) */}
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex justify-between items-center relative group z-10 hover:z-50">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 cursor-help">
                    Readiness
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  </label>
                  <span className="text-sm font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm min-w-[3rem] text-center">
                    {scores.readinessType === 'commercialization'
                      ? scores.readinessCommercialization
                      : scores.readinessType === 'adoption'
                        ? scores.readinessAdoption
                        : 0}
                  </span>

                  {/* Tooltip */}
                  <div className="absolute left-0 top-full mt-2 w-full p-3 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none leading-relaxed">
                    <p className="mb-2 font-semibold text-indigo-300">
                      Mutually exclusive toggle. Scoring one disables the other.
                    </p>
                    <p className="mb-1">
                      <strong className="text-white">
                        7a Commercialization:
                      </strong>{' '}
                      Evidence of market demand or traction (LOIs, pilots, beta
                      users, competitor scan). Clear understanding of market
                      positioning and user validation. Meets TRL7 or greater.
                    </p>
                    <p>
                      <strong className="text-white">7b Adoption:</strong>{' '}
                      Evidence of needs assessment or training plan that is
                      aligned to immediate needs.
                    </p>
                    <div className="absolute left-6 bottom-full w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-slate-800"></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() =>
                      handleScoreChange(
                        'readinessType',
                        scores.readinessType === 'commercialization'
                          ? null
                          : 'commercialization',
                      )
                    }
                    className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${scores.readinessType === 'commercialization' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    7a. Commercialization
                  </button>
                  <button
                    onClick={() =>
                      handleScoreChange(
                        'readinessType',
                        scores.readinessType === 'adoption'
                          ? null
                          : 'adoption',
                      )
                    }
                    className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${scores.readinessType === 'adoption' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    7b. Adoption
                  </button>
                </div>

                {scores.readinessType === 'commercialization' && (
                  <div className="space-y-3">
                    <input
                      type="range"
                      min="0"
                      max="5"
                      value={scores.readinessCommercialization || 0}
                      onChange={(e) =>
                        handleScoreChange(
                          'readinessCommercialization',
                          parseInt(e.target.value),
                        )
                      }
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-xs text-slate-400 font-medium">
                      <span>0</span>
                      <span>5</span>
                    </div>
                  </div>
                )}

                {scores.readinessType === 'adoption' && (
                  <div className="space-y-3">
                    <input
                      type="range"
                      min="0"
                      max="5"
                      value={scores.readinessAdoption || 0}
                      onChange={(e) =>
                        handleScoreChange(
                          'readinessAdoption',
                          parseInt(e.target.value),
                        )
                      }
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-xs text-slate-400 font-medium">
                      <span>0</span>
                      <span>5</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-8"></div>
            </div>
          </div>
        </div>
      )}

      {/* Report Generation Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Generate Report
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Who reviewed this EOI?
              </label>
              <select
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                className="w-full border border-slate-300 rounded-md p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-700 bg-white"
              >
                <option value="" disabled>
                  Select a reviewer...
                </option>
                <option value="Lesley">Lesley</option>
                <option value="Corinne">Corinne</option>
                <option value="Juliet">Juliet</option>
                <option value="Other">Other...</option>
              </select>
            </div>

            {reviewer === 'Other' && (
              <div className="mb-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Please specify:
                </label>
                <input
                  type="text"
                  value={otherReviewer}
                  onChange={(e) => setOtherReviewer(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-700"
                  placeholder="Enter reviewer name"
                  autoFocus
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-8">
              <button
                onClick={() => {
                  setIsReportModalOpen(false);
                  setReviewer('');
                  setOtherReviewer('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const finalReviewer =
                    reviewer === 'Other' ? otherReviewer.trim() : reviewer;
                  generateReport(finalReviewer);
                  setIsReportModalOpen(false);
                }}
                disabled={
                  !reviewer || (reviewer === 'Other' && !otherReviewer.trim())
                }
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Generate Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
