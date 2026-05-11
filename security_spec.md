# Security Specification

## Data Invariants
1. Products must have a non-empty name.
2. Stock entries are uniquely identified by `locationId_variationId`.
3. Transactions must have a valid type (SALE, PURCHASE, TRANSFER).
4. Stock Transfers must have source and destination locations.
5. All writes require authentication.

## The Dirty Dozen Payloads

1. **Identity Spoofing (Product):** Attacker tries to create a product without being signed in.
2. **Identity Spoofing (Product):** Attacker tries to update a product name to an empty string.
3. **Identity Spoofing (Stock):** Attacker tries to set quantity to a negative number.
4. **Identity Spoofing (Stock):** Attacker tries to update stock for a location they don't own (though we don't have location ownership yet, just auth check).
5. **State Shortcutting (Transfer):** Attacker tries to create a transfer with status 'COMPLETED' bypassing logic (need to ensure only valid statuses).
6. **Resource Poisoning (Location):** Attacker tries to inject a 1MB string into the location code.
7. **Resource Poisoning (Location):** Attacker tries to use a non-alphanumeric code for location.
8. **Field Injection (Customer):** Attacker adds a `balance` field to a customer document which isn't in schema.
9. **Field Injection (Dealer):** Attacker adds `isPartner: true` to a dealer document.
10. **Orphaned Write (Transaction):** Attacker creates a transaction referencing a non-existent location.
11. **Timestamp Spoofing (Transaction):** Attacker provides a past date for `timestamp` instead of `request.time`.
12. **Malicious Delete (Product):** Attacker tries to delete all products.

## The Test Runner
(Placeholder for actual test file if needed, but I will focus on the rules first)
