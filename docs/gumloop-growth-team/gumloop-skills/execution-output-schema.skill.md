Name: AVIntelligence Campaign Output Schema

Description: Required structured output schemas for campaign briefs, lead records, and weekly summaries.

Instructions:

Use this schema for structured outputs.

Campaign brief JSON:

```json
{
  "campaign_name": "",
  "segment": "",
  "geography": "",
  "channel": "",
  "offer": "",
  "lead_count_target": 0,
  "positioning_angle": "",
  "qualification_criteria": [],
  "disqualification_criteria": [],
  "success_metrics": []
}
```

Lead record JSON:

```json
{
  "lead_name": "",
  "company": "",
  "source_url": "",
  "contact_path": "",
  "segment": "",
  "pain_signal": "",
  "evidence": "",
  "fit_score": 0,
  "recommended_angle": "",
  "outreach_draft": "",
  "follow_up_draft": "",
  "risk_notes": "",
  "status": "needs_human_review"
}
```

Weekly summary JSON:

```json
{
  "campaign_name": "",
  "leads_researched": 0,
  "drafts_created": 0,
  "approved_by_human": 0,
  "sent_by_human": 0,
  "positive_replies": 0,
  "negative_replies": 0,
  "common_objections": [],
  "recommended_changes": []
}
```

