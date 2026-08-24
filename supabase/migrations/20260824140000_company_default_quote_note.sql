-- Predvolená poznámka pre klienta, ktorá sa predvyplní do každej novej
-- kalkulácie a vytlačí sa do PDF ponuky. Doteraz bola konštantou v kóde,
-- takže jej zmena vyžadovala nasadenie; teraz si ju admin upraví
-- v Nastavenia → Firemné údaje.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS default_quote_note text;

-- Naplň existujúci riadok textom platobných a storno podmienok.
-- Prepisuje sa iba prázdna hodnota, aby opakované spustenie nič nezmazalo.
UPDATE public.company_settings
   SET default_quote_note = $txt$Platobné a storno podmienky:

Pri potvrdení cenovej ponuky objednávkou sa objednávateľ zaväzuje uhradiť zálohu vo výške 60 % z celkovej ceny, a to najneskôr 3 dni pred začiatkom inštalácie.

Zvyšných 40 % z ceny bude vyúčtovaných faktúrou po ukončení akcie, so splatnosťou 30 dní od jej vystavenia.

Pri zrušení objednávky pred akciou účtujeme storno poplatok z celkovej sumy nasledovne: 50 % z celkovej sumy 2 dni pred akciou a 90 % z celkovej sumy pri zrušení akcie deň vopred alebo v deň jej konania.$txt$,
       updated_at = now()
 WHERE NULLIF(btrim(COALESCE(default_quote_note, '')), '') IS NULL;

-- Práva sa nemenia: company_settings má SELECT pre `authenticated` (formulár
-- kalkulácie si text načíta) a zápis len pre rolu admin.
