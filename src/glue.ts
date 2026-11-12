// Our Prolog glue, embedded so it works the same from source, from dist, and in browsers.
// Licensed GPL-3.0-only (see LICENSE).
export const GLUE = String.raw`% ace-linting glue: turns APE results into plain rows that JavaScript can read.
% Copyright ace-linting contributors. Licensed under GPL-3.0-only (see LICENSE).

:- module(ace_glue, [lint_rows/3, add_entries/3]).

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

read_entries(In, Entries) :-
    read_term(In, Term, []),
    (   Term == end_of_file
    ->  Entries = []
    ;   Entries = [Term|Rest],
        read_entries(In, Rest)
    ).
`;
