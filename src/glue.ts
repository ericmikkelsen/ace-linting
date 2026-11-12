// SPDX-License-Identifier: GPL-3.0-only
// Our Prolog glue, embedded so it works the same from source, from dist, and in browsers.
// Licensed GPL-3.0-only (see LICENSE).
export const GLUE = String.raw`% ace-linting glue: turns APE results into plain rows that JavaScript can read.
% Copyright ace-linting contributors. Licensed under GPL-3.0-only (see LICENSE).

:- module(ace_glue, [lint_rows/7, add_entries/3, remove_entries/2, ask_rows/5]).

%% lint_rows(+Text, -MessageRows, -TokenRows, -ObjectRows, -EventRows, -PropertyRows, -ModifierRows)
%  MessageRows: [[Importance, Scope, Sentence, Token, Subject, Description], ...]
%  (Sentence and Token are numbers, or '' when APE gives none)
%  TokenRows: one list of tokens per sentence, with APE's start marker removed.
%  ObjectRows: [[Id, Noun, Sentence, Token], ...]   PropertyRows: [[Id, Adjective, Sentence, Token], ...]
%  EventRows: [[EventId, Verb, [ArgId, ...], Sentence, Token, Modality], ...]
%    Modality: the boxes around the event, outermost first (must, can, should, may, not, naf, question,
%    command, if, then, or); [] for a plain fact.
%  ModifierRows: [[EventId, Kind, Word, ValueId], ...]: Kind pp (Word is the preposition, ValueId its object)
%    or adv (Word is the adverb, ValueId is '').
%  Ids are atoms: rN for a discourse referent, n:Name for a proper name, s:Text for a quoted string.
lint_rows(Text, MessageRows, TokenRows, ObjectRows, EventRows, PropertyRows, ModifierRows) :-
    ace_to_drs:acetext_to_drs(Text, Sentences, _Trees, Drs, Messages),
    maplist(message_row, Messages, MessageRows),
    maplist(token_row, Sentences, TokenRows),
    drs_facts(Drs, ObjectRows, EventRows, PropertyRows, ModifierRows).

drs_facts(Drs, Objects, Events, Properties, Modifiers) :-
    copy_term(Drs, D),
    numbervars(D, 0, _),
    findall([Id, Noun, S, T],
            ( sub_term(P-S/T, D), compound(P), P =.. [object, Ref, Noun|_], ref_id(Ref, Id) ),
            Objects),
    findall([Id, Adj, S, T],
            ( sub_term(P-S/T, D), compound(P), P =.. [property, Ref, Adj|_], ref_id(Ref, Id) ),
            Properties),
    findall([EventId, Verb, ArgIds, S, T, Modality],
            ( event_in(D, [], P-S/T, Modality0), P =.. [predicate, Event, Verb|Args], Args \== [],
              ref_id(Event, EventId), maplist(ref_id, Args, ArgIds), reverse(Modality0, Modality) ),
            Events),
    findall([EventId, pp, Prep, ValueId],
            ( sub_term(modifier_pp(Event, Prep, Value)-_, D), ref_id(Event, EventId), ref_id(Value, ValueId) ),
            PPs),
    findall([EventId, adv, Adverb, ''],
            ( sub_term(modifier_adv(Event, Adverb, _)-_, D), ref_id(Event, EventId) ),
            Advs),
    append(PPs, Advs, Modifiers).

% event_in(+Drs, +Boxes, -Condition, -BoxesAround): every condition in Drs with the boxes it sits in, innermost
% first. Implications, disjunctions and modal boxes are walked into; a plain sub-DRS adds no box.
event_in(drs(_, Conds), Boxes, Cond, Around) :-
    member(C, Conds),
    cond_in(C, Boxes, Cond, Around).

cond_in(C, Boxes, C, Boxes) :- C = _-_, !.
cond_in(If => Then, Boxes, Cond, Around) :- !,
    ( event_in(If, [if|Boxes], Cond, Around) ; event_in(Then, [then|Boxes], Cond, Around) ).
cond_in(A v B, Boxes, Cond, Around) :- !,
    ( event_in(A, [or|Boxes], Cond, Around) ; event_in(B, [or|Boxes], Cond, Around) ).
cond_in(Box, Boxes, Cond, Around) :-
    compound(Box), Box =.. [Op, Sub], Sub = drs(_, _), !,
    event_in(Sub, [Op|Boxes], Cond, Around).
cond_in(drs(Rs, Cs), Boxes, Cond, Around) :- !,
    event_in(drs(Rs, Cs), Boxes, Cond, Around).
cond_in(Other, Boxes, Cond, Around) :-
    compound(Other), Other =.. [_|Args], member(Sub, Args), Sub = drs(_, _),
    event_in(Sub, Boxes, Cond, Around).

ref_id('$VAR'(N), Id) :- !, format(atom(Id), 'r~w', [N]).
ref_id(named(Name), Id) :- !, format(atom(Id), 'n:~w', [Name]).
ref_id(string(Text), Id) :- !, format(atom(Id), 's:~w', [Text]).
ref_id(Other, Id) :- format(atom(Id), '~w', [Other]).

message_row(message(Importance, Scope, Pos, Subject, Description),
            [Importance, Scope, Sentence, Token, Subject, Description]) :-
    position(Pos, Sentence, Token).

position(Sentence-Token, Sentence, Token) :- !.
position(_, '', '').

token_row(Tokens0, Tokens) :-
    exclude(==(^), Tokens0, Tokens1),
    maplist(token_atom, Tokens1, Tokens).

token_atom(T, A) :- format(atom(A), '~w', [T]).

%% add_entries(+Text, -Count, -MessageRows)
%  Text holds Prolog terms, each ending with a period (APE lexicon entries).
%  Adds them to APE's user lexicon and returns the messages APE logged (conflicts, malformed entries).
add_entries(Text, Count, MessageRows) :-
    error_logger:clear_messages,
    setup_call_cleanup(open_string(Text, In), read_entries(In, Entries), close(In)),
    maplist(ulex:add_lexicon_entry, Entries),
    length(Entries, Count),
    error_logger:get_messages(Messages),
    error_logger:clear_messages,   % do not leak lexicon warnings into later parses
    maplist(message_row, Messages, MessageRows).

%% ask_rows(+Axioms, +Query, -ProofRows, -WhyNotRows, -MessageTexts)
%  Runs RACE. ProofRows: one list of text lines per proof. WhyNotRows: words RACE could not match.
ask_rows(Axioms, Query, ProofRows, WhyNotRows, MessageTexts) :-
    race:answer_query(Axioms, Query, [], Messages, _RunTime, Proofs, WhyNot),
    maplist(proof_row, Proofs, ProofRows),
    maplist(token_atom, WhyNot, WhyNotRows),
    maplist(message_text, Messages, MessageTexts).

proof_row(proof(Lines, _Auxiliary), Atoms) :- maplist(token_atom, Lines, Atoms).

message_text(message(_, _, _, Subject, Description), Text) :-
    format(atom(Text), '~w: ~w', [Subject, Description]).

%% remove_entries(+Text, -Count)
%  Removes the lexicon terms in Text from APE's user lexicon (all copies; a term that is not there is ignored).
remove_entries(Text, Count) :-
    setup_call_cleanup(open_string(Text, In), read_entries(In, Entries), close(In)),
    forall(member(Entry, Entries), retractall(ulex:Entry)),
    length(Entries, Count).

read_entries(In, Entries) :-
    read_term(In, Term, []),
    (   Term == end_of_file
    ->  Entries = []
    ;   Entries = [Term|Rest],
        read_entries(In, Rest)
    ).
`;

// RACE uses call_with_time_limit/2 from library(time), which swipl-wasm does not include.
// We run without an in-Prolog limit and enforce timeouts by terminating the worker instead.
export const TIME_STUB = String.raw`:- meta_predicate user:call_with_time_limit(+, 0).
user:call_with_time_limit(_Time, Goal) :- once(Goal).
`;
