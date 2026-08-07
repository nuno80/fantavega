# Locked credits dopo rilancio e acquisizione

## Scenario verificato

Manager A apre un’asta a 10 con auto-bid massimo 20. Il sistema blocca 20 nel suo record privato, mentre il prezzo pubblico resta 10. Se Manager B supera A oltre il massimo, l’auto-bid A viene disattivato e A non deve più avere quei 20 bloccati. Se l’asta viene poi chiusa e assegnata a B, nessun credito residuo di A deve rimanere bloccato.

## Correzione

Dopo una chiusura definitiva, lo scheduler ricostruisce `locked_credits` dalla fonte di verità: auto-bid attivi e offerte manuali vincenti su aste ancora `active` o `closing`. Il calcolo è scoped per lega, idempotente e non modifica `current_budget`.

## Perché è sicuro

La riconciliazione avviene solo dopo il commit della chiusura e solo quando almeno un’asta è stata assegnata. Non cambia prezzi, vincitori, budget o assegnazioni. Serve come rete di sicurezza contro auto-bid disattivati prima del vecchio ricalcolo.

## Dipendenza

Applicare dopo PR #35. I test su due leghe e il claim viewed arrivano dalla PR precedente. Questa PR non sostituisce un futuro refactor transazionale del settlement, ma elimina il residuo bloccato entro il successivo ciclo dello scheduler.
