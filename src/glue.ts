// Our Prolog glue, embedded so it works the same from source, from dist, and in browsers.
// Licensed GPL-3.0-only (see LICENSE).
export const GLUE = String.raw`% ace-linting glue: turns APE results into plain rows that JavaScript can read.
% Copyright ace-linting contributors. Licensed under GPL-3.0-only (see LICENSE).

:- module(ace_glue, [lint_rows/3, add_entries/3, ask_rows/5]).

%% lint_rows(+Text, -MessageRows, -TokenRows)
%  MessageRows: [[Importance, Scope, Sentence, Token, Subject, Description], ...]
%  (Sentence and Token are numbers, or '' when APE gives none)
%  TokenRows: one list of tokens per sentence, with APE's start marker removed.
lint_rows(Text, MessageRows, TokenRows) :-
    ace_to_drs:acetext_to_drs(Text, Sentences, _Trees, _Drs, Messages),
    maplist(message_row, Messages, MessageRows),
    maplist(token_row, Sentences, TokenRows).

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
