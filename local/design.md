string theory

react app to help learn and play guitar and understand music theory

use C:\Users\Administrator\Desktop\Programing\Web\React\abracadabra as a reference for style

primary mobile web app

tabs

tuner [DONE]
    when enabled, listen and display a dial showning the note, frequency ¢ off from a note
    chose guitar tuning standard, drop d, drop c, 5 string bass, 4 string bass
    implementation notes:
      - SVG semicircular gauge (-50¢ to +50¢), needle animates in real time
      - Normalized autocorrelation pitch detection, 80ms polling interval
      - fftSize 4096 for accuracy on low bass notes
      - Green accent when within ±5 cents ("In Tune")
      - Tuning presets show reference string notes (e.g. E2 A2 D3 G3 B3 E4)

guitar scale visualizer [TODO]
    show a fretboard and allow picking a scale major and minor. mark all valid notes on the fretboard and highlight the base note 
    (A
    A# / Bb
    B 
    C
    C# / Db
    D
    D# / Eb
    E
    F
    F# / Gb
    G 
    G# / Ab)

music theory [TODO]
    read music study
        show a piano (side scrollable) and music sheet
        show a note on the sheet and the user guesses which note on the piano it is (octave does not matter) and show if the user is right, if wrong, show the correct piano key
