# Backlog

Prioritized work for the squad. Devs claim directly - no dispatcher needed.

---

## Workflow

```
READY → IN_PROGRESS → DONE → QA_TESTING → QA_PASSED → SHIPPED
                               ↓                ↓
                          QA_FAILED      (if Review Required)
                          (back to dev)        ↓
                                          REVIEWING → REVIEWED → SHIPPED
```

1. **PO** adds items as `## READY:`
2. **Devs** claim by changing to `## IN_PROGRESS: @dev-name`
3. **Devs** complete by changing to `## DONE: @dev-name`
4. **QA** verifies and changes to `## QA_PASSED:` or `## QA_FAILED:`
5. **Reviewer** (if flagged) reviews and changes to `## REVIEWED:`
6. **DevOps** deploys and changes to `## SHIPPED:`

---

## Priority Guide

- **P0** - Production down, drop everything
- **P1** - Core feature, high impact
- **P2** - Important, can wait
- **P3** - Nice to have

---

## Flags

Add these to items when creating them:
- `Review Required: yes` - Triggers code review after QA pass

---

## Ready for Work
<!-- Devs: claim these by adding @your-name and changing to IN_PROGRESS -->

---

## In Progress
<!-- Currently being built -->

---

## Done (Awaiting QA)
<!-- Completed by dev, waiting for QA verification -->

---

## QA Passed (Ready for Deploy)
<!-- Verified working, ready for deployment (unless Review Required) -->

---

## Reviewed
<!-- Code reviewed and approved, ready for deployment -->

---

## Shipped
<!-- Deployed to production -->

