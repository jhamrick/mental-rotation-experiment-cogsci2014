/* task.js
 * 
 * This file holds the main experiment code.
 * 
 * Requires:
 *   config.js
 *   psiturk.js
 *   utils.js
 */

// Create and initialize the experiment configuration object
var $c = new Config(condition, counterbalance);

// Initalize psiturk object
var psiTurk = new PsiTurk();

// Preload the HTML template pages that we need for the experiment
psiTurk.preloadPages($c.pages);

// Objects to keep track of the current phase and state
var CURRENTVIEW;
var STATE;


/*************************
 * INSTRUCTIONS         
 *************************/

var Instructions = function() {

    // The list of pages for this set of instructions
    this.pages = $c.instructions[STATE.experiment_phase].pages;
    // The list of examples on each page of instructions
    this.examples = $c.instructions[STATE.experiment_phase].examples;
    // Time when a page of instructions is presented
    this.timestamp;

    // Display a page of instructions, based on the current
    // STATE.index
    this.show = function() {

        debug("show slide " + this.pages[STATE.index]);

        // Load the next page of instructions
        $(".slide").hide();
        var slide = $("#" + this.pages[STATE.index]);
        slide.fadeIn($c.fade);

        // Update the URL hash
        STATE.set_hash();

        this.example = this.examples[STATE.index];
	if (this.example) {
            // Draw the examples
            draw_shape($("#example1_left_image")[0], this.example[0].v0);
            draw_shape($("#example1_right_image")[0], this.example[0].v1);
            draw_shape($("#example2_left_image")[0], this.example[1].v0);
            draw_shape($("#example2_right_image")[0], this.example[1].v1);
	}
	    
        // Bind a handler to the "next" button. We have to wrap it in
        // an anonymous function to preserve the scope.
        var that = this;
        slide.find('.next').click(function () {
            that.record_response();
        });

        // Record the time that an instructions page is presented
        this.timestamp = new Date().getTime();
    };

    // Handler for when the "next" button is pressed
    this.record_response = function() {

        // Calculate the response time
        var rt = (new Date().getTime()) - this.timestamp;
        debug("'Next' button pressed");

        // Record the data. The format is: 
        // experiment phase, instructions, index, trial_phase, response time
        var data = new DataRecord();
        data.update(STATE.as_data());
        data.update(this.examples[STATE.index]);
        data.update({response: "", response_time: rt});
        psiTurk.recordTrialData(data.to_array());
        debug(data.to_array());

        // Go to the next page of instructions, or complete these
        // instructions if there are no more pages
        if ((STATE.index + 1) >= this.pages.length) {
            this.finish();
        } else {
            STATE.set_index(STATE.index + 1);
            this.show();
        }
    };

    // Clean up the instructions phase and move on to the test phase
    this.finish = function() {
        debug("Done with instructions")

        // Record that the user has finished the instructions and
        // moved on to the experiment. This changes their status
        // code in the database.
	if (STATE.experiment_phase == EXPERIMENT.training) {
            psiTurk.finishInstructions();
	}

        // Reset the state object for the test phase
        STATE.set_instructions(0);
        STATE.set_index();
        STATE.set_trial_phase();
        CURRENTVIEW = new TestPhase();
    };

    // Display the first page of instructions
    this.show();
};



/*****************
 *  TRIALS       *
 *****************/

var TestPhase = function() {

    /* Instance variables */

    // When the time response period begins
    this.timestamp; 
    // Whether the object is listening for responses
    this.listening = false;

    // List of trials in this block of the experiment
    this.trials = $c.trials[STATE.experiment_phase];
    // Information about the current trial
    this.trialinfo;    
    // The response they gave
    this.response;
    // The number they've gotten correct, so far
    this.num_correct = 0;

    // Handlers to setup each phase of a trial
    this.phases = new Object();

    // Initialize a new trial. This is called either at the beginning
    // of a new trial, or if the page is reloaded between trials.
    this.init_trial = function () {
        debug("Initializing trial " + STATE.index);
        $(".phase").hide();

        // If there are no more trials left, then we are at the end of
        // this phase
        if (STATE.index >= this.trials.length) {
            this.finish();
            return false;
        }
        
        // Load the new trialinfo
        this.trialinfo = this.trials[STATE.index];

        // Update progress bar
        update_progress(STATE.index, this.trials.length);

	// Update the score
	if (STATE.experiment_phase > EXPERIMENT.training) {
	    update_score(STATE.index, this.num_correct, true);
	} else {
	    update_score(STATE.index, this.num_correct, false);
	}

        // Register the response handler to record responses
        var that = this;
        $(document.body).attr("tabIndex", 1).keydown(function (e) {
            that.record_response(e.which);
        });

        return true;
    };

    // Phase 1: show the prompt
    this.phases[TRIAL.prestim] = function(that) {
        $("#phase-container").hide();

        // Initialize the trial
        if (that.init_trial()) {
            // Actually show the prestim element
            debug("Show PRESTIM");

	    $("#fixation").hide()
	    $("#prestim").find("div.question").show()
            $("#prestim").show();
            $("#phase-container").show();
            // Listen for a response to show the stimulus
            that.listening = true;
        }
    };

    // Phase 2: show the fixation
    this.phases[TRIAL.fixation] = function(that) {
        // Actually show the prestim element
        debug("Show FIXATION");

	show_phase("fixation");

        setTimeout(function () {
            STATE.set_trial_phase(STATE.trial_phase + 1);
            that.show();
        }, 750);
    };

    // Phase 3: show the stimulus
    this.phases[TRIAL.stim] = function (that) {
        debug("Show STIMULUS");

        // Hide prestim and show stim
        show_phase("stim");
        draw_shape($("#left_image")[0], that.trialinfo.v0);
        draw_shape($("#right_image")[0], that.trialinfo.v1);

        // Listen for a response
        that.listening = true;
    };

    // Phase 4: show feedback
    this.phases[TRIAL.feedback] = function (that) {
        debug("Show FEEDBACK");

        // Hide stim and show feedback
        show_phase("feedback");

        var correct;
        if (that.trialinfo.flipped && that.response == "flipped") {
            correct = true;
        } else if (!that.trialinfo.flipped && that.response == "same") {
            correct = true;
        } else {
            correct = false;
        }

        var timeout;
        if (correct) {
            $("#feedback-area").html("Correct!");
	    that.num_correct = that.num_correct + 1;
            timeout = 500;
        } else {
            var answer;
            if (that.trialinfo.flipped) {
                answer = "flipped";
            } else {
                answer = "same";
            }
            $("#feedback-area").html("Sorry, the correct answer was <b>" + answer + "</b>.");
            timeout = 1000;
        }

        setTimeout(function () {
            STATE.set_trial_phase();
            STATE.set_index(STATE.index + 1);
            that.show();
        }, timeout);
    };

    // Show the current trial at the currect phase
    this.show = function () {
        // Update the URL hash
        STATE.set_hash();
        // Call the phase setup handler
        this.phases[STATE.trial_phase](this);
        // Record when this phase started
        this.timestamp = new Date().getTime();
    };

    // Record a response (this could be either just clicking "start",
    // or actually a choice to the prompt(s))
    this.record_response = function(key) {
        // If we're not listening for a response, do nothing
        if (!this.listening) return;

        // Record response time
        var rt = (new Date().getTime()) - this.timestamp;

        // Parse the actual value of the data to record
        var response = KEYS[STATE.trial_phase][key];
        if (response == undefined) return;
        this.listening = false;

        debug("Record response: " + response);

        var data = new DataRecord();
        data.update(this.trialinfo);
        data.update(STATE.as_data());
        data.update({
            response_time: rt, 
            response: response,
        });

        // Create the record we want to save
        psiTurk.recordTrialData(data.to_array());
        debug(data.to_array());

        if (STATE.trial_phase == TRIAL.stim) {
            this.response = response;
        }

        // Tell the state to go to the next trial phase or trial
        if (STATE.trial_phase == (TRIAL.length - 1)) {
            STATE.set_trial_phase();
            STATE.set_index(STATE.index + 1);
        } else {
            STATE.set_trial_phase(STATE.trial_phase + 1);
        }            

        // Update the page with the current phase/trial
        this.show();
    };

    // Complete the set of trials in the test phase
    this.finish = function() {
        debug("Finish test phase");

        // Reset the state object for the next experiment phase
	STATE.set_experiment_phase(STATE.experiment_phase + 1);
        STATE.set_instructions();
        STATE.set_index();
        STATE.set_trial_phase();

        // If we're at the end of the experiment, submit the data to
        // mechanical turk, otherwise go on to the next experiment
        // phase and show the relevant instructions
        if (STATE.experiment_phase >= EXPERIMENT.length) {

            // Send them to the debriefing form, but delay a bit, so
            // they know what's happening
            var debrief = function() {
                setTimeout(function () {
                    window.location = "/debrief?uniqueId=" + psiTurk.taskdata.id;
                }, 2000);
            };

            // Prompt them to resubmit the HIT, because it failed the first time
            var prompt_resubmit = function() {
                $("#resubmit_slide").click(resubmit);
                $(".slide").hide();
                $("#submit_error_slide").fadeIn($c.fade);
            };

            // Show a page saying that the HIT is resubmitting, and
            // show the error page again if it times out or error
            var resubmit = function() {
                $(".slide").hide();
                $("#resubmit_slide").fadeIn($c.fade);

                var reprompt = setTimeout(prompt_resubmit, 10000);
                psiTurk.saveData({
                    success: function() {
                        clearInterval(reprompt); 
                        finish();
                    }, 
                    error: prompt_resubmit
                });
            };

            // Render a page saying it's submitting
            psiTurk.showPage("submit.html")
            psiTurk.teardownTask();
            psiTurk.saveData({
                success: debrief, 
                error: prompt_resubmit
            });

        } else {
            CURRENTVIEW = new Instructions();
        }
    };

    // Load the trial html page
    $(".slide").hide();
    // Draw the fixation cross
    draw_fixation($("#fixation_canvas")[0]);
    // Show the slide
    $("#trial").fadeIn($c.fade);

    // Initialize the current trial -- we need to do this here in
    // addition to in prestim in case someone refreshes the page in
    // the middle of a trial
    if (this.init_trial()) {
        // Start the test
        this.show();
    };
};


// --------------------------------------------------------------------
// --------------------------------------------------------------------

/*******************
 * Run Task
 ******************/

$(document).ready(function() { 
    // Load the HTML for the trials
    psiTurk.showPage("trial.html");

    // Record field names for the data that we'll be collecting
    var data = new DataRecord();
    var fields = JSON.stringify(data.fields);
    psiTurk.recordUnstructuredData("fields", fields);
    debug(fields);

    // Record various unstructured data
    psiTurk.recordUnstructuredData("condition", condition);
    psiTurk.recordUnstructuredData("counterbalance", counterbalance);
    psiTurk.recordUnstructuredData("choices", $("#choices").html());

    // Start the experiment
    STATE = new State();

    // Begin the experiment phase
    if (STATE.instructions) {
        CURRENTVIEW = new Instructions();
    } else {
        CURRENTVIEW = new TestPhase();
    }
});
