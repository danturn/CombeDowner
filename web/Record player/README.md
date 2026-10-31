# Record player

The record player on the folding table up on Little Solsbury Hill plays the MIDI files in this
folder (`.mid` or `.midi`), one after another in order of their file names, round and round, while
you're near it. With nothing here, it sits silent.

Drop a file in, push to `main`, and it's on the record once the site has rebuilt. The game plays each
instrument on its own synthesised voices (`web/src/midiplayer.ts`), so it sounds like a General MIDI
sound card through a portable's little speaker, not like the original recording.

Only put files here that you're happy to publish: whatever is in this folder goes out with the game.
