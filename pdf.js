const PDFDocument = require('pdfkit');

function scoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function scoreGrade(score) {
  return score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return { r, g, b, a: alpha };
}

function wrapText(doc, text, maxWidth, fontSize) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (doc.widthOfString(test, { size: fontSize }) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function generateReportPdf(report, cfg = {}) {
  const doc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true });
  const chunks = [];
  doc.on('data', c => chunks.push(c));

  const accent = cfg.brandColor || '#6c5ce7';
  const brandName = cfg.brandName || 'SEODominate';
  const accentTint = rgba(accent, 0.1);
  const gray = '#6b7280';
  const dark = '#1f2937';
  const maxW = doc.page.width - 96;
  const accentLight = rgba(accent, 0.9);

  const gbp = report.gbp || {};
  const score = gbp.score || 0;
  const grade = scoreGrade(score);
  const checks = gbp.checks || [];
  const revenue = gbp.revenue || {};
  const competitors = gbp.competitors || [];
  const ai = gbp.aiVisibility || [];
  const heatmaps = gbp.heatmaps || [];
  const aeo = report.aeo || {};
  const geo = report.geo || {};
  const summary = report.summary || {};
  const fixes = Array.isArray(summary.fixes) ? summary.fixes : [];
  const blockers = Array.isArray(summary.rankBlockers) ? summary.rankBlockers : [];
  const aiFound = ai.filter(a => a.found).length;

  const accentRgb = hexToRgb(accent);
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f6f5ff');

  // ===== HEADER =====
  doc.fill(accentRgb).rect(0, 0, doc.page.width, 160).fill();
  if (cfg.brandLogoUrl) {
    try { doc.image(cfg.brandLogoUrl, 48, 28, { width: 120 }); } catch {}
  } else {
    doc.font('Helvetica-Bold').fontSize(28).fill('#ffffff').text(brandName, 48, 44);
  }
  doc.font('Helvetica-Bold').fontSize(22).fill('#ffffff').text('Google Business Profile Audit', 48, 92);
  doc.font('Helvetica').fontSize(12).fill(rgba('#ffffff', 0.85)).text(report.business + '  •  ' + report.location, 48, 122);

  doc.rect(0, 160, doc.page.width, 6).fill(rgba('#ffffff', 0.25));

  let y = 196;

  // ===== SCORE + KEY METRICS =====
  const scoreBoxW = 150, scoreBoxH = 150, boxGap = 18;
  const scoreBoxX = 48, scoreBoxY = y;
  doc.circle(scoreBoxX + scoreBoxW / 2, scoreBoxY + scoreBoxH / 2, scoreBoxW / 2 - 10).lineWidth(10).strokeColor(scoreColor(score)).opacity(0.25).stroke();
  doc.opacity(1).circle(scoreBoxX + scoreBoxW / 2, scoreBoxY + scoreBoxH / 2, scoreBoxW / 2 - 10).lineWidth(4).strokeColor(scoreColor(score)).stroke();
  doc.font('Helvetica-Bold').fontSize(40).fill(dark).text(String(score) + '%', scoreBoxX + 30, scoreBoxY + 48, { width: scoreBoxW - 60, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(14).fill(gray).text('Grade ' + grade, scoreBoxX + 30, scoreBoxY + 100, { width: scoreBoxW - 60, align: 'center' });

  const metricX = scoreBoxX + scoreBoxW + boxGap;
  const metricW = maxW - scoreBoxW - boxGap;
  const metricH = (scoreBoxH - 18) / 2;
  const metrics = [
    ['Monthly Revenue at Stake', '$' + (revenue.atStake || 0).toLocaleString(), '#f97316'],
    ['AI Platforms Found', aiFound + ' / ' + ai.length, '#10b981'],
    ['Monthly Searches', (revenue.monthlySearches || 0).toLocaleString(), '#6366f1'],
    ['Avg. Customer Value', '$' + (revenue.avgCustomerValue || 0).toLocaleString(), '#8b5cf6'],
  ];
  metrics.forEach((m, i) => {
    const mx = metricX + (i % 2) * (metricW / 2 + 8);
    const my = scoreBoxY + (Math.floor(i / 2)) * (metricH + 8);
    doc.roundedRect(mx, my, metricW / 2, metricH, 10).fill(rgba('#ffffff', 0.9));
    doc.font('Helvetica').fontSize(10).fill(gray).text(m[0].toUpperCase(), mx + 14, my + 14, { width: metricW / 2 - 28 });
    doc.font('Helvetica-Bold').fontSize(18).fill(m[2]).text(m[1], mx + 14, my + 32, { width: metricW / 2 - 28 });
  });
  y += scoreBoxH + 30;

  // ===== AI VISIBILITY BAR =====
  doc.font('Helvetica-Bold').fontSize(15).fill(dark).text('AI Platform Visibility', 48, y);
  y += 24;
  const barY = y, barH = 14, totalW = maxW;
  const segW = (totalW - 40) / Math.max(ai.length, 1);
  doc.roundedRect(48, barY, totalW, barH, 7).fill(rgba('#e5e7eb', 0.7));
  let bx = 48;
  ai.forEach(a => {
    if (a.found) doc.rect(bx, barY, segW, barH).fill(accentLight);
    bx += segW;
  });
  doc.font('Helvetica').fontSize(10).fill(gray).text(ai.map(a => a.platform + (a.found ? ' ✓' : ' ✗')).join('   |   '), 48, barY + barH + 10);
  y = barY + barH + 34;

  // ===== KEYWORD RANKINGS =====
  if (heatmaps.length) {
    doc.font('Helvetica-Bold').fontSize(15).fill(dark).text('Keyword Rankings (avg local position)', 48, y);
    y += 24;
    const rowH = 24;
    heatmaps.forEach(h => {
      doc.font('Helvetica').fontSize(11).fill(dark).text(h.keyword || 'Keyword', 48, y);
      doc.font('Helvetica-Bold').fontSize(12).fill(scoreColor((h.averageRank || 20) <= 5 ? 90 : (h.averageRank || 20) <= 10 ? 65 : 35)).text('#' + (h.averageRank != null ? h.averageRank.toFixed(1) : '20'), 48 + maxW - 60, y, { width: 60, align: 'right' });
      y += rowH;
    });
    y += 14;
  }

  // ===== GBP CHECKLIST =====
  doc.font('Helvetica-Bold').fontSize(15).fill(dark).text('Profile Checklist (' + checks.filter(c => c.pass).length + '/' + checks.length + ' passing)', 48, y);
  y += 24;
  checks.forEach(c => {
    doc.circle(54, y + 6, 4).fill(c.pass ? '#10b981' : '#ef4444');
    doc.font('Helvetica').fontSize(11).fill(dark).text(c.label || '', 66, y);
    doc.font('Helvetica-Bold').fontSize(11).fill(c.pass ? '#10b981' : '#ef4444').text(c.pass ? 'PASS' : 'FAIL', 48 + maxW - 50, y, { width: 50, align: 'right' });
    y += 22;
  });
  y += 14;

  // ===== COMPETITORS =====
  if (competitors.length) {
    doc.addPage();
    y = 48;
    doc.rect(0, 0, doc.page.width, 160).fill(accentRgb).fill();
    doc.font('Helvetica-Bold').fontSize(22).fill('#ffffff').text('Competitor Benchmark', 48, 92);
    doc.font('Helvetica').fontSize(12).fill(rgba('#ffffff', 0.85)).text(report.business + '  •  ' + report.location, 48, 122);
    doc.rect(0, 160, doc.page.width, 6).fill(rgba('#ffffff', 0.25));
    y = 196;
    competitors.slice(0, 8).forEach((c, i) => {
      doc.roundedRect(48, y, maxW, 60, 10).fill(rgba('#ffffff', 0.9));
      doc.font('Helvetica-Bold').fontSize(13).fill(accentRgb).text('#' + (i + 1) + '  ' + c.name, 64, y + 10, { width: maxW - 28 });
      doc.font('Helvetica').fontSize(10).fill(gray).text(c.address || '', 64, y + 30, { width: maxW - 28 });
      doc.font('Helvetica-Bold').fontSize(11).fill('#f59e0b').text('★ ' + c.rating + '  •  ' + c.reviews + ' reviews', 64, y + 30 + 16);
      y += 70;
      if (y > doc.page.height - 90) { doc.addPage(); y = 48; }
    });
  }

  // ===== FIXES =====
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 160).fill(accentRgb).fill();
  doc.font('Helvetica-Bold').fontSize(22).fill('#ffffff').text('Prioritized Fixes', 48, 92);
  doc.rect(0, 160, doc.page.width, 6).fill(rgba('#ffffff', 0.25));
  y = 196;

  if (blockers.length) {
    doc.font('Helvetica-Bold').fontSize(14).fill(dark).text('Top Rank Blockers', 48, y);
    y += 24;
    blockers.forEach(b => {
      doc.circle(54, y + 5, 3.5).fill(accentLight);
      doc.font('Helvetica').fontSize(11).fill(dark).text(b || '', 66, y, { width: maxW - 26 });
      const used = doc.heightOfString(b || '', { width: maxW - 26 });
      y += used + 10;
    });
    y += 14;
  }

  doc.font('Helvetica-Bold').fontSize(14).fill(dark).text('Recommended Actions', 48, y);
  y += 24;
  const priorityColor = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' };
  fixes.forEach(f => {
    const lines = wrapText(doc, f.text, maxW - 26, 11);
    const lineH = 16;
    const boxH = lines.length * lineH + 22;
    if (y + boxH > doc.page.height - 80) { doc.addPage(); y = 48; }
    doc.roundedRect(48, y, maxW, boxH, 8).fill(rgba('#ffffff', 0.9));
    doc.roundedRect(48, y, 6, boxH, 3).fill(priorityColor[f.priority] || accentLight);
    doc.font('Helvetica-Bold').fontSize(10).fill(priorityColor[f.priority] || dark).text((f.priority || 'Medium').toUpperCase(), 66, y + 8, { width: maxW - 26 });
    doc.font('Helvetica').fontSize(11).fill(dark).text(f.text || '', 66, y + 24, { width: maxW - 26 });
    y += boxH + 12;
  });

  // ===== EXEC SUMMARY =====
  if (summary.executiveSummary) {
    y += 14;
    if (y > doc.page.height - 140) { doc.addPage(); y = 48; }
    doc.font('Helvetica-Bold').fontSize(14).fill(dark).text('Executive Summary', 48, y);
    y += 24;
    const lines = wrapText(doc, summary.executiveSummary, maxW, 11);
    lines.forEach(l => { doc.font('Helvetica').fontSize(11).fill(gray).text(l, 48, y, { width: maxW }); y += 17; });
  }

  // ===== FOOTER =====
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(9).fill(gray).text(brandName + '  •  Generated ' + (report.timestamp ? new Date(report.timestamp).toLocaleDateString() : new Date().toLocaleDateString()) + '  •  Audit ID ' + report.auditId, 48, doc.page.height - 36, { width: maxW, align: 'center' });
  }

  doc.end();
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

module.exports = { generateReportPdf };
