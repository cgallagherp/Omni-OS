"""Generates the fictional Clinara integration documents used by the demo seed and tests.
Run: python3 scripts/seed/integration-docs/generate.py  (outputs sit next to this script)."""
import os
from docx import Document
from pptx import Presentation
from pptx.util import Pt
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

OUT = os.path.dirname(os.path.abspath(__file__))
p = lambda n: os.path.join(OUT, n)

# 1. The company's own playbook (policy) --------------------------------------------------
d = Document()
d.add_heading("Clinara Integration Playbook (version 2, approved by the ELT, May 2024)", 0)
d.add_paragraph("Fictional demonstration document.")
d.add_heading("Integration philosophy", 1)
for t in [
    "We buy specialist clinic software and integrate it onto the Clinara platform: one product, one CRM, one billing engine.",
    "Customers come first: no customer should experience disruption in the first 100 days.",
    "Acquired brands are retired within 12 months unless the Board agrees a standalone or partial integration.",
    "We integrate fully by default; partial integration (keep brand and product, integrate finance and sales) applies to capability acquisitions.",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Acquisition types", 1)
for t in [
    "Full integration: specialist software with overlapping customers; migrate onto the Clinara platform within 12 months.",
    "Partial integration: capability acquisition where the product and brand stay separate; integrate finance, people and go-to-market.",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Workstream: Strategy and governance", 1)
for t in [
    "Pre-completion: appoint integration leader and sponsor (Owner: CEO). Completion criteria: named leader with at least 50% of their time allocated.",
    "Day 1: hold integration steering committee kick-off (Owner: Integration leader). Milestone.",
    "First 30 days: agree target operating model and decision rights (Owner: CEO). Approval: CEO. Completion criteria: TOM signed off by the ELT.",
    "Weekly: integration status report to the ELT (Owner: Integration leader).",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Workstream: Finance", 1)
for t in [
    "Day 1: take control of bank accounts and payment authorities (Owner: CFO). Critical path. Completion criteria: dual signatories from Clinara on every account.",
    "First 30 days: align month-end reporting to the Clinara calendar (Owner: CFO). Completion criteria: first month-end closed within 5 working days.",
    "First 100 days: migrate billing onto Clinara Pay (Owner: CFO). Depends on: CRM migration. Completion criteria: 100% of invoices issued from Clinara Pay.",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Workstream: Commercial", 1)
for t in [
    "Day 1: customer announcement email from both CEOs (Owner: CCO). Approval: CEO.",
    "First 30 days: assign account owners for every acquired customer (Owner: CCO). Completion criteria: every active customer has a named Clinara account owner in the CRM.",
    "Day 60: migrate customer records into the Clinara CRM (Owner: Head of RevOps). Critical path. Completion criteria: all active accounts, contacts and open opportunities migrated and reconciled.",
    "First 100 days: launch cross-selling of Clinara modules to acquired customers (Owner: CCO). Depends on: CRM migration. Completion criteria: cross-sell pipeline reported weekly.",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Workstream: People", 1)
for t in [
    "Pre-completion: identify key employees and agree retention arrangements (Owner: People Director). Approval: CEO.",
    "Day 1: all-hands announcement to acquired employees (Owner: CEO).",
    "First 30 days: payroll and benefits mapped onto Clinara providers (Owner: People Director). Completion criteria: first payroll run without errors.",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Workstream: Technology", 1)
for t in [
    "Pre-completion: systems inventory of the target (Owner: CTO).",
    "First 30 days: single sign-on and identity onto Clinara Entra ID (Owner: CTO). Completion criteria: all acquired staff on Clinara identity with MFA enforced.",
    "First 100 days: product migration plan agreed (Owner: CPTO). Approval: CEO.",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Workstream: Legal and compliance", 1)
for t in [
    "Pre-completion: change-of-control consents from key customers and suppliers (Owner: General Counsel). Critical path.",
    "First 30 days: insurance policies extended to the acquired company (Owner: CFO).",
    "First 30 days: data protection review and ICO registration updated (Owner: General Counsel).",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Risks and escalation", 1)
for t in [
    "Risk: customer churn after announcement. Escalate to the CEO if more than 2% of ARR gives notice in the first 100 days.",
    "Risk: loss of key engineers. Escalate to the CEO on any resignation of a key employee.",
    "Risk: CRM migration slips and delays cross-selling. Escalate to the steering committee if the migration is more than two weeks late.",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Integration KPIs", 1)
for t in ["Gross revenue retention of acquired customers (target at least 95%).", "Cross-sell ARR from acquired customers.", "Integration milestones achieved on time (target at least 80%)."]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Synergy tracking", 1)
for t in [
    "Synergies are tracked monthly by the CFO against the investment case.",
    "Only invoiced revenue and booked savings count as realised; forecasts are reported separately.",
]:
    d.add_paragraph(t, style="List Bullet")
d.save(p("clinara-integration-playbook-v2.docx"))

# 2. DentalDesk integration plan (2023) — spreadsheet with planned vs actual -------------------
wb = Workbook(); ws = wb.active; ws.title = "DentalDesk plan"
ws.append(["Workstream", "Activity", "Owner", "Timing", "Planned", "Actual", "Status", "Notes"])
rows = [
    ("Strategy and governance", "Appoint integration leader", "CEO", "Pre-completion", "2023-02-20", "2023-02-20", "Done", ""),
    ("Finance", "Bank accounts and payment authorities", "CFO", "Day 1", "2023-03-01", "2023-03-01", "Done", ""),
    ("Commercial", "Customer announcement email", "CCO", "Day 1", "2023-03-01", "2023-03-01", "Done", ""),
    ("Commercial", "Customer data cleansing", "Head of RevOps", "First 30 days", "2023-03-31", "2023-05-12", "Done late", "Duplicate practice records and missing contacts; took six weeks longer than planned"),
    ("Commercial", "Migrate customer records into the Clinara CRM", "Head of RevOps", "Day 60", "2023-04-30", "2023-06-16", "Done late", "Blocked by data cleansing"),
    ("Commercial", "Launch cross-selling to acquired customers", "CCO", "First 100 days", "2023-06-09", "2023-08-01", "Done late", "Started after CRM migration"),
    ("People", "Payroll and benefits mapped", "People Director", "First 30 days", "2023-03-31", "2023-03-28", "Done", ""),
    ("Technology", "Single sign-on onto Clinara identity", "CTO", "First 30 days", "2023-03-31", "2023-04-14", "Done", ""),
    ("Legal and compliance", "Change-of-control consents", "General Counsel", "Pre-completion", "2023-02-27", "2023-02-27", "Done", ""),
    ("Brand and communications", "Retire DentalDesk brand", "CMO", "Month 12", "2024-03-01", "2024-02-15", "Done", ""),
]
for r in rows: ws.append(r)
wb.save(p("dentaldesk-integration-plan-2023.xlsx"))

# 3. OptiBook 100-day plan (2024) — PowerPoint -----------------------------------------------
pr = Presentation()
def slide(title, bullets):
    s = pr.slides.add_slide(pr.slide_layouts[1]); s.shapes.title.text = title
    tf = s.placeholders[1].text_frame; tf.text = bullets[0]
    for b in bullets[1:]: tf.add_paragraph().text = b
slide("OptiBook 100-day integration plan (fictional)", ["Completion 1 July 2024", "Full integration onto the Clinara platform", "Integration leader: Head of Integration"])
slide("Commercial workstream", [
    "Day 1: customer announcement email (Owner: CCO)",
    "First 30 days: customer data cleansing (Owner: Head of RevOps)",
    "Day 60: migrate customer records into the Clinara CRM (Owner: Head of RevOps). Critical path",
    "First 100 days: launch cross-selling to acquired customers (Owner: CCO). Depends on: CRM migration",
])
slide("Technology workstream", [
    "Pre-completion: systems inventory (Owner: CTO)",
    "First 30 days: single sign-on onto Clinara identity (Owner: CTO)",
    "First 100 days: product migration plan agreed (Owner: CPTO)",
])
slide("Finance workstream", [
    "Day 1: bank accounts and payment authorities (Owner: CFO)",
    "First 100 days: migrate billing onto Clinara Pay (Owner: CFO). Depends on: CRM migration",
])
slide("Status at day 100", [
    "CRM migration completed on day 94, 34 days late: data quality issues were found only after completion",
    "Cross-selling launched on day 120, missing the 100-day milestone",
    "Billing migration slipped to day 130",
])
pr.save(p("optibook-100-day-plan-2024.pptx"))

# 4. CareNotes integration checklist (2025, partial integration) — PDF ----------------------
st = getSampleStyleSheet()
doc = SimpleDocTemplate(p("carenotes-integration-checklist-2025.pdf"), pagesize=A4)
el = [Paragraph("CareNotes integration checklist (partial integration, 2025) — fictional", st["Title"]),
      Paragraph("CareNotes kept its brand and product. Finance, people and go-to-market were integrated.", st["Normal"]), Spacer(1, 12)]
for h, items in [
    ("Commercial", [
        "Customer communication within 5 working days after completion, not on Day 1, because CareNotes customers are on annual contracts (Owner: CCO)",
        "First 30 days: assign account owners for every acquired customer (Owner: CCO)",
        "First 30 days: customer data assessment before CRM migration (Owner: Head of RevOps)",
        "Day 60: migrate customer records into the Clinara CRM (Owner: Head of RevOps)",
    ]),
    ("People", ["Pre-completion: identify key employees and agree retention arrangements (Owner: People Director)", "First 30 days: payroll and benefits mapped (Owner: People Director)"]),
    ("Technology", ["First 30 days: single sign-on onto Clinara identity (Owner: CTO)", "First 30 days: penetration test of the acquired product (Owner: CTO)"]),
    ("Brand and communications", ["Brand retained: no brand migration for partial integrations (Owner: CMO)"]),
]:
    el.append(Paragraph(h, st["Heading2"]))
    for i in items: el.append(Paragraph("• " + i, st["Normal"]))
el.append(PageBreak())
el.append(Paragraph("Outcome", st["Heading2"]))
el.append(Paragraph("CRM migration completed on day 75, 15 days late, because customer data was incomplete. Cross-selling began on day 110.", st["Normal"]))
doc.build(el)

# 5. Post-acquisition review — DentalDesk (Word) ----------------------------------------------
d = Document()
d.add_heading("Post-acquisition review: DentalDesk (presented to the Board, March 2024)", 0)
d.add_paragraph("Fictional demonstration document.")
d.add_heading("What went well", 1)
for t in ["Day 1 finance controls were in place on completion.", "Retention of acquired customers was 97% of ARR."]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("What went wrong", 1)
for t in [
    "Customer data cleansing took six weeks longer than planned and delayed the CRM migration by seven weeks.",
    "Cross-selling started on day 153 instead of day 100 because account owners could not see acquired customers in the CRM.",
    "Cross-sell revenue reached £310k in year one against a plan of £600k.",
]:
    d.add_paragraph(t, style="List Bullet")
d.add_heading("Lessons", 1)
for t in [
    "Lesson: assess customer data quality before completion, during diligence.",
    "Lesson: do not start cross-selling until account ownership is visible in the CRM.",
]:
    d.add_paragraph(t, style="List Bullet")
d.save(p("post-acquisition-review-dentaldesk.docx"))

# 6. Lessons learned (Markdown) ------------------------------------------------------------
open(p("lessons-learned-optibook-carenotes.md"), "w").write("""# Lessons learned: OptiBook and CareNotes integrations (fictional)

## Recurring delays
- Lesson: customer data migration delayed commercial integration in OptiBook (34 days late) and CareNotes (15 days late), as it did in DentalDesk.
- Lesson: the customer data assessment should happen before completion so that the CRM migration can start in the first 30 days.
- Lesson: billing migration depends on the CRM migration and slipped each time the CRM migration slipped.

## What we would do differently
- Lesson: announce to customers on annual contracts after completion, once account owners are assigned (CareNotes approach), rather than on Day 1.
- Lesson: run a penetration test of every acquired product in the first 30 days; CareNotes found two high-severity issues.
""")

# 7. Buy-and-build strategy (Board paper, PDF) -----------------------------------------------
doc = SimpleDocTemplate(p("buy-and-build-strategy-board-2026.pdf"), pagesize=A4)
el = [Paragraph("Clinara buy-and-build strategy — Board paper, March 2026 (fictional)", st["Title"]),
      Paragraph("Agreed strategy: acquire two to three specialist clinic software businesses a year in adjacent verticals (veterinary, physiotherapy, dental, optometry), "
                "integrate them onto the Clinara platform and grow through cross-selling payments and patient engagement modules.", st["Normal"]),
      Paragraph("Investment criteria: £2m–£10m ARR, recurring revenue above 85%, overlapping customer profile (independent and group clinics).", st["Normal"]),
      Paragraph("Value creation: cross-selling Clinara Pay and Engage to acquired customers; hosting and tooling consolidation savings.", st["Normal"]),
      Paragraph("Integration approach: full integration by default; partial integration where the acquired brand is strong in its vertical.", st["Normal"])]
doc.build(el)
print("generated", sorted(f for f in os.listdir(OUT) if not f.endswith(".py")))
