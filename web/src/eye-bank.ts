// What the critics' eye (eye.ts) can recognise in a painting, and how each subject of the evening
// looks, in words. The words are turned into the model's own terms once, ahead of time, by
// tools/critics_eye_bank.mjs, which writes web/public/critics-eye.json: change anything here and run
// it again, or the eye notices the list has changed and stays shut (the hand-made critics carry on).
//
// Each thing has what the model is asked ("a drawing of" goes in front), what the visitors call it,
// and, where sight.ts has a word for the same thing, that word, so a match counts as if the shape
// tests had found it. Things with no word ("a scribble", "a blank canvas") are there so a painting
// of nothing in particular has somewhere to go rather than being forced to look like a dog.
//
// Who decides what: nothing here decides anything; it's the host's eye that uses it.
import type { Rude, Thing } from "./sight";

export interface Seeable { ask: string; word?: string; k?: Thing | Rude }

const t = (ask: string, word?: string, k?: Thing | Rude): Seeable => ({ ask, word, k });

export const BANK: Seeable[] = [
  // what sight.ts also looks for
  t("the sun", "the sun", "sun"), t("the sun with rays", "the sun", "sun"),
  t("a red double-decker bus", "the bus", "bus"), t("a bus", "the bus", "bus"),
  t("a cat", "the cat", "cat"), t("a cat's face", "the cat", "cat"),
  t("a face", "the face", "face"), t("a smiley face", "the face", "face"), t("a portrait of a person", "the face", "face"),
  t("seagulls", "the gulls", "birds"), t("birds flying", "the birds", "birds"), t("a seagull", "the gull", "birds"),
  t("a house", "the house", "house"), t("a row of houses", "the houses", "house"),
  t("a tree", "the tree", "tree"), t("a forest", "the trees", "tree"),
  t("a stick figure", "the little man", "figure"), t("a person standing", "the little man", "figure"),
  t("handwriting", "the writing", "writing"), t("words written in capital letters", "the writing", "writing"),
  t("a crude drawing of a penis", "the rocket", "penis"), t("a penis", "the rocket", "penis"),
  t("a drawing of breasts", "the pair", "boobs"), t("breasts", "the pair", "boobs"),
  t("a bottom", "the bottom", "bum"), t("a bum", "the bottom", "bum"),
  // animals
  t("a dog", "the dog"), t("a horse", "the horse"), t("a cow", "the cow"), t("a pig", "the pig"), t("a sheep", "the sheep"),
  t("a duck", "the duck"), t("a swan", "the swan"), t("a pigeon", "the pigeon"), t("a fish", "the fish"), t("a rabbit", "the rabbit"),
  t("a mouse", "the mouse"), t("a snake", "the snake"), t("a spider", "the spider"), t("a bee", "the bee"), t("a butterfly", "the butterfly"),
  t("a dinosaur", "the dinosaur"), t("an elephant", "the elephant"), t("a lion", "the lion"), t("a bear", "the bear"), t("a frog", "the frog"),
  t("an owl", "the owl"), t("a giraffe", "the giraffe"), t("a crocodile", "the crocodile"), t("a shark", "the shark"), t("a whale", "the whale"),
  t("a snail", "the snail"), t("a hedgehog", "the hedgehog"), t("a fox", "the fox"), t("a badger", "the badger"), t("a squirrel", "the squirrel"),
  t("a chicken", "the chicken"), t("a penguin", "the penguin"), t("a monkey", "the monkey"), t("a unicorn", "the unicorn"), t("a dragon", "the dragon"),
  // vehicles
  t("a car", "the car"), t("a lorry", "the lorry"), t("a bin lorry", "the bin lorry"), t("a train", "the train"), t("a bicycle", "the bike"),
  t("a boat", "the boat"), t("an aeroplane", "the aeroplane"), t("a hot air balloon", "the balloon"), t("a rocket ship", "the rocket"),
  t("a tractor", "the tractor"), t("a police car", "the police car"), t("a fire engine", "the fire engine"), t("a taxi", "the taxi"),
  t("a helicopter", "the helicopter"), t("a motorbike", "the motorbike"), t("a scooter", "the scooter"), t("a canal boat", "the narrowboat"),
  // buildings and places
  t("a church", "the church"), t("a castle", "the castle"), t("a bridge", "the bridge"), t("a tower", "the tower"), t("a skyscraper", "the tower block"),
  t("a shop front", "the shop"), t("a pub", "the pub"), t("a pub sign", "the pub sign"), t("a garden shed", "the shed"), t("a lighthouse", "the lighthouse"),
  t("a city street", "the street"), t("a room indoors", "the room"), t("a garden", "the garden"), t("a fence", "the fence"), t("a wall of stone", "the wall"),
  t("a street lamp", "the lamp post"), t("a traffic light", "the traffic lights"), t("a bus stop", "the bus stop"), t("a wheelie bin", "the bin"),
  t("a door", "the door"), t("a window", "the window"), t("a tent", "the tent"), t("a playground slide", "the slide"),
  // Bath
  t("Bath Abbey", "the Abbey"), t("the Royal Crescent", "the Crescent"), t("a curved Georgian terrace", "the terrace"),
  t("Pulteney Bridge over a weir", "the bridge"), t("the Roman Baths with a green pool", "the Baths"), t("a Roman column", "the column"),
  t("a Roman soldier", "the Roman"), t("a Roman emperor in a toga", "the emperor"), t("a mosaic", "the mosaic"),
  // people
  t("a family", "the family"), t("a baby", "the baby"), t("a crowd of people", "the crowd"), t("a skeleton", "the skeleton"),
  t("a ghost", "the ghost"), t("a robot", "the robot"), t("an alien", "the alien"), t("a king with a crown", "the king"),
  t("a queen", "the queen"), t("a policeman", "the copper"), t("a footballer", "the footballer"), t("a witch", "the witch"),
  t("a pirate", "the pirate"), t("a clown", "the clown"), t("a superhero", "the superhero"), t("a nun", "the nun"),
  t("a boy running", "the lad"), t("a hand", "the hand"), t("eyes", "the eyes"), t("a foot", "the foot"),
  // food and drink
  t("chips", "the chips"), t("a burger", "the burger"), t("a pizza", "the pizza"), t("an ice cream", "the ice cream"),
  t("a cake", "the cake"), t("a biscuit", "the biscuit"), t("a banana", "the banana"), t("an apple", "the apple"),
  t("a marrow", "the marrow"), t("a carrot", "the carrot"), t("a cup of tea", "the cup of tea"), t("a pint of beer", "the pint"),
  t("a glass of wine", "the wine"), t("a bottle", "the bottle"), t("a sandwich", "the sandwich"), t("a fried egg", "the egg"),
  t("a sausage", "the sausage"), t("a doughnut", "the doughnut"), t("a cherry", "the cherries"), t("a strawberry", "the strawberry"),
  t("a watermelon", "the melon"), t("a pie", "the pie"), t("a teapot", "the teapot"), t("a fish and chips supper", "the fish supper"),
  // weather, sky and land
  t("the moon", "the moon"), t("stars in the night sky", "the stars"), t("a rainbow", "the rainbow"), t("clouds", "the clouds"),
  t("rain", "the rain"), t("lightning", "the lightning"), t("a snowman", "the snowman"), t("flowers", "the flowers"),
  t("a sunflower", "the sunflower"), t("mountains", "the hills"), t("the sea", "the sea"), t("a river", "the river"),
  t("a beach", "the beach"), t("fireworks", "the fireworks"), t("a volcano", "the volcano"), t("a sunset", "the sunset"),
  t("a field of grass", "the field"), t("a lake", "the lake"), t("a waterfall", "the waterfall"), t("an island", "the island"),
  // odds and ends
  t("a heart", "the heart"), t("a flag"), t("the Union Jack", "the Union Jack"), t("a skull", "the skull"),
  t("a crown", "the crown"), t("a sword", "the sword"), t("a football", "the football"), t("a mushroom", "the mushroom"),
  t("an umbrella", "the umbrella"), t("a clock", "the clock"), t("a guitar", "the guitar"), t("a key", "the key"),
  t("a light bulb", "the light bulb"), t("a balloon", "the balloon"), t("a kite", "the kite"), t("a present", "the present"),
  t("a christmas tree", "the Christmas tree"), t("a pumpkin", "the pumpkin"), t("a spaceship", "the spaceship"), t("a planet", "the planet"),
  t("a toilet", "the loo"), t("a poo", "the poo"), t("a middle finger", "the finger"), t("a phone", "the phone"),
  t("a television", "the telly"), t("a chair", "the chair"), t("a table", "the table"), t("a bed", "the bed"),
  t("a lamp", "the lamp"), t("a hat", "the hat"), t("a shoe", "the shoe"), t("glasses", "the glasses"),
  // nothing in particular
  t("a scribble"), t("abstract shapes"), t("a blank white canvas"), t("coloured stripes"), t("a pattern"),
  t("a circle"), t("a square"), t("a triangle"), t("a star shape"), t("a diamond shape"), t("random coloured lines"),
  t("a landscape"), t("blue sky above green grass"), t("a beam of light"),
  t("splodges of paint"), t("a single colour"), t("dots"), t("a grid"),
];

/** How each of the evening's subjects might look, keyed by its title as in critics.ts. A pub, a
 *  street and a place are left general: the model has never heard of the pub round the corner. */
export const SUBJECTS: Record<string, string[]> = {
  "A seagull's revenge": ["a seagull attacking people", "a seagull stealing chips"],
  "Self-portrait as a Roman": ["a portrait of a Roman with a laurel wreath", "a man in a Roman helmet"],
  "{place} on a Tuesday": ["a quiet English village street with houses", "a town with houses and trees"],
  "Sunrise over the rooftops": ["the sun rising over rooftops", "a sunrise over houses"],
  "Last orders at {pub}": ["people drinking in a pub", "a pint of beer on a bar"],
  "The night bus home": ["a bus at night", "a double-decker bus in the dark"],
  "Still life with chips": ["a still life of chips", "a plate of chips"],
  "A cat who owns the street": ["a cat sitting in the street", "a proud cat"],
  "The bin lorry, seven in the morning": ["a bin lorry collecting rubbish", "a rubbish truck in the morning"],
  "Rush hour on {street}": ["a busy street with traffic", "cars and buses in a traffic jam"],
  "The strange structure": ["a strange dark monolith", "a mysterious alien structure"],
  "A naughty boy legging it": ["a boy running away", "a naughty child running"],
  "Heatwave": ["a hot sunny day", "a blazing sun in a blue sky"],
  "Rain. Again.": ["rain falling", "a grey rainy day"],
  "Your nan's front room": ["a cosy old living room", "a grandmother's sitting room"],
  "The bus that never came": ["an empty bus stop", "people waiting at a bus stop"],
  "Pigeons plotting something": ["a group of pigeons", "pigeons huddled together"],
  "A Roman in the bath": ["a Roman bathing in a pool", "a man in a bath"],
  "Fireworks over {place}": ["fireworks over a town at night", "fireworks in the night sky"],
  "The prize marrow": ["a giant green marrow", "a prize vegetable"],
  "Portrait of whoever's on your left": ["a portrait of a person", "a face"],
  "The last biscuit in the tin": ["a biscuit in a tin", "a single biscuit"],
  "Swans having a row": ["two swans fighting", "angry swans on a river"],
  "Hot air balloons at breakfast": ["hot air balloons in the sky", "colourful hot air balloons"],
};

/** Put in front of everything asked, then the answers averaged: two ways of asking beat one. */
export const ASKS = ["a drawing of {}", "a simple computer painting of {}"];

/** The model, pinned to one revision so the words worked out ahead of time always match its eye.
 *  SigLIP's scale and bias come from Google's own weights (they're not in the browser copy). */
export const MODEL = {
  id: "Xenova/siglip-base-patch16-224",
  revision: "4649052661e53c7000355844105f8a1792088239",
  dtype: "q4",
  size: 224,
  scale: 117.33,
  bias: -12.93,
} as const;
