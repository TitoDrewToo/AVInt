# Analyst workflow map

The same Smart Storage evidence model supports several interview-relevant workflows:

| Workflow | Input | Primary output |
| --- | --- | --- |
| Reconciliation | Two normalized datasets | Matched/missing/duplicate/conflict rows |
| Data quality | One normalized dataset | Required-field, code, range, and duplicate scorecard |
| EOD controls | Expected control file + received feeds | Break status, variances, missing feeds |
| Management reporting | Current and prior periods | Trends, material changes, actions |
| Requirements validation | Requirement + evidence source | Test cases, expected/observed result, retest status |
| Regulatory-shaped validation | Synthetic financial extract + rules | Completeness, code, period, and total checks |

The production implementation should keep the source evidence and correction history shared. Only the rule set and output template should vary.

For interview practice, start with reconciliation and data quality. Add EOD controls next. Treat regulatory outputs as validation support, never as regulatory certification.
