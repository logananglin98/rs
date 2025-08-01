/* ********************************
 * |docname| - Runestone Base Class
 * ********************************
 * All runestone components should inherit from RunestoneBase. In addition all runestone components should do the following things:
 *
 * 1.   Ensure that they are wrapped in a div with the class runestone
 * 2.   Write their source AND their generated html to the database if the database is configured
 * 3.   Properly save and restore their answers using the checkServer mechanism in this base class. Each component must provide an implementation of:
 *
 *      -    checkLocalStorage
 *      -    setLocalStorage
 *      -    restoreAnswers
 *      -    disableInteraction
 *
 * 4.   provide a Selenium based unit test
 */

import { pageProgressTracker } from "./bookfuncs.js";
//import "./../styles/runestone-custom-sphinx-bootstrap.css";

var NO_DECORATE = ["parsonsMove", "showeval", "video", "poll", "view_toggle",
    "dashboard", "selectquestion", "codelens", "peer", "shortanswer"]
export default class RunestoneBase {
    constructor(opts) {
        this.component_ready_promise = new Promise(
            (resolve) => (this._component_ready_resolve_fn = resolve)
        );
        this.optional = false;
        if (typeof window.allComponents === "undefined") {
            window.allComponents = [];
        }
        window.allComponents.push(this);
        if (opts) {
            this.sid = opts.sid;
            this.graderactive = opts.graderactive;
            this.showfeedback = true;
            if (opts.timed) {
                this.isTimed = true;
            }
            if (opts.enforceDeadline) {
                this.deadline = opts.deadline;
            }
            if ($(opts.orig).data("optional")) {
                this.optional = true;
            } else {
                this.optional = false;
            }
            if (opts.selector_id) {
                this.selector_id = opts.selector_id;
            }
            if (typeof opts.assessmentTaken !== "undefined") {
                this.assessmentTaken = opts.assessmentTaken;
            } else {
                // default to true as this opt is only provided from a timedAssessment
                this.assessmentTaken = true;
            }
            // This is for the selectquestion points
            // If a selectquestion is part of a timed exam it will get
            // the timedWrapper options.
            if (typeof opts.timedWrapper !== "undefined") {
                this.timedWrapper = opts.timedWrapper;
            } else {
                // However sometimes selectquestions
                // are used in regular assignments.  The hacky way to detect this
                // is to look for doAssignment in the URL and then grab
                // the assignment name from the heading.
                if (location.href.indexOf("doAssignment") >= 0) {
                    this.timedWrapper = $("h1#assignment_name").text();
                } else {
                    this.timedWrapper = null;
                }
            }
            if ($(opts.orig).data("question_label")) {
                this.question_label = $(opts.orig).data("question_label");
            }
            this.is_toggle = true ? opts.is_toggle : false;
            this.is_select = true ? opts.is_select : false;
        }
        this.mjelements = [];
        let self = this;
        this.mjReady = new Promise(function (resolve, reject) {
            self.mjresolver = resolve;
        });
        this.aQueue = new AutoQueue();
        if (opts && typeof opts.preamble !== "undefined") {
            this.preamble = opts.preamble;
            let y = document.createElement("div");
            y.classList.add("hidden-content");
            y.classList.add("process-math");
            y.innerHTML = "\\(" + this.preamble + "\\)";
            // This is a hack to get the preamble into the DOM so that MathJax can process it.
            opts.orig.appendChild(y);
            y.id = "ltx_preamble";
            y.style.display = "none";
            // Add the preamble to the queue object so it can prepend it to
            // future MathJax processing
            this.aQueue.preamble = y
        }

        this.jsonHeaders = new Headers({
            "Content-type": "application/json; charset=utf-8",
            Accept: "application/json",
        });
    }

    // _`logBookEvent`
    //----------------
    // This function sends the provided ``eventInfo`` to the `hsblog endpoint` of the server. Awaiting this function returns either ``undefined`` (if Runestone services are not available) or the data returned by the server as a JavaScript object (already JSON-decoded).
    async logBookEvent(eventInfo) {
        if (this.graderactive) {
            return;
        }
        let post_return;
        eventInfo.course_name = eBookConfig.course;
        eventInfo.clientLoginStatus = eBookConfig.isLoggedIn;
        eventInfo.timezoneoffset = new Date().getTimezoneOffset() / 60;
        if (typeof this.percent === "number") {
            eventInfo.percent = this.percent;
        }
        if (window.assignmentId) {
            eventInfo.assignment_id = window.assignmentId;
        }
        if (
            eBookConfig.isLoggedIn &&
            eBookConfig.useRunestoneServices &&
            eBookConfig.logLevel > 0
        ) {
            post_return = this.postLogMessage(eventInfo);
        }
        if (!this.isTimed || eBookConfig.debug) {
            let prefix = eBookConfig.isLoggedIn ? "Save" : "Not";
            console.log(`${prefix} logging event ` + JSON.stringify(eventInfo));
        }
        // When selectquestions are part of an assignment especially toggle questions
        // we need to count using the selector_id of the select question.
        // We  also need to log an event for that selector so that we will know
        // that interaction has taken place.  This is **independent** of how the
        // autograder will ultimately grade the question!
        if (this.selector_id) {
            eventInfo.div_id = this.selector_id.replace(
                "-toggleSelectedQuestion",
                ""
            );
            eventInfo.event = "selectquestion";
            eventInfo.act = "interaction";
            this.postLogMessage(eventInfo);
        }
        if (
            typeof pageProgressTracker.updateProgress === "function" &&
            eventInfo.act != "edit" &&
            this.optional == false
        ) {
            pageProgressTracker.updateProgress(eventInfo.div_id);
        }
        // if the event is in the NO_DECORATE list then don't decorate the status
        if (NO_DECORATE.indexOf(eventInfo.event) === -1) {
            this.decorateStatus();
        }
        return post_return;
    }

    async postLogMessage(eventInfo) {
        var post_return;
        let request = new Request(
            `${eBookConfig.new_server_prefix}/logger/bookevent`,
            {
                method: "POST",
                headers: this.jsonHeaders,
                body: JSON.stringify(eventInfo),
            }
        );
        try {
            var response = await fetch(request);
            if (!response.ok) {
                if (response.status === 422) {
                    // Get details about why this is unprocesable.
                    post_return = await response.json();
                    console.log(JSON.stringify(post_return.detail, null, 4));
                    throw new Error("Unprocessable Request");
                } else if (response.status == 401) {
                    post_return = await response.json();
                    console.log(
                        `Missing authentication token ${post_return.detail}`
                    );
                    throw new Error("Missing authentication token");
                }
                throw new Error(`Failed to save the log entry
                    Status: ${response.status}`);
            }
            post_return = await response.json();
            let scoreSpec = post_return.detail;
            let gradeBox = null;
            if (this.selector_id) {
                let selector_id = this.selector_id.replace(
                    "-toggleSelectedQuestion",
                    ""
                );
                gradeBox = document.getElementById(`${selector_id}_score`);
            } else {
                gradeBox = document.getElementById(`${this.divid}_score`);
            }
            if (gradeBox && !this.isTimed && scoreSpec.score) {
                this.updateScores(gradeBox, scoreSpec);
            }
        } catch (e) {
            let detail = "none";
            if (post_return && post_return.detail) {
                detail = post_return.detail;
            }
            if (eBookConfig.useRunestoneServices) {
                alert(`Error: Your action was not saved!
                    The error was ${e}
                    Status Code: ${response.status}
                    Detail: ${JSON.stringify(detail, null, 4)}.
                    Please report this error!`);
            }
            // send a request to save this error
            console.log(
                `Error: ${e} Detail: ${detail} Status Code: ${response.status}`
            );
        }
        return post_return;
    }
    // update the score for the question and the total score
    // the presence of the gradeBox is used to determine if we are on an assignment page.
    updateScores(gradeBox, scoreSpec) {
        if (!scoreSpec.assigned || scoreSpec.score === null) {
            document.getElementById(`${this.divid}_message`).innerHTML = "Score not updated.  Submissions are closed.";
            return;
        }
        let scoreSpan = gradeBox.getElementsByClassName("qscore")[0];
        if (scoreSpan) {
            scoreSpan.innerHTML = scoreSpec.score.toFixed(1);
        }
        let allScores = document.getElementsByClassName("qscore");
        let allmax = document.getElementsByClassName("qmaxscore");
        let total = 0;
        let max = 0;
        for (let i = 0; i < allScores.length; i++) {
            total += parseFloat(allScores[i].innerHTML);
            max += parseFloat(allmax[i].innerHTML);
        }
        let totalSpan = document.getElementById("total_score");
        if (totalSpan) {
            totalSpan.innerHTML = total.toFixed(1);
        }
        let maxSpan = document.getElementById("total_max");
        if (maxSpan) {
            maxSpan.innerHTML = max;
        }
        let percentSpan = document.getElementById("total_percent");
        if (percentSpan) {
            percentSpan.innerHTML = ((total / max) * 100).toFixed(2);
        }
    }

    // .. _logRunEvent:
    //
    // logRunEvent
    // -----------
    // This function sends the provided ``eventInfo`` to the `runlog endpoint`. When awaited, this function returns the data (decoded from JSON) the server sent back.
    async logRunEvent(eventInfo) {
        let post_promise = "done";
        if (this.graderactive) {
            return;
        }
        eventInfo.course = eBookConfig.course;
        eventInfo.clientLoginStatus = eBookConfig.isLoggedIn;
        eventInfo.timezoneoffset = new Date().getTimezoneOffset() / 60;
        if (this.forceSave || "to_save" in eventInfo === false) {
            eventInfo.save_code = "True";
        }
        if (typeof eventInfo.errinfo !== "undefined") {
            eventInfo.errinfo = eventInfo.errinfo.toString();
        }
        if (
            eBookConfig.isLoggedIn &&
            eBookConfig.useRunestoneServices &&
            eBookConfig.logLevel > 0
        ) {
            let request = new Request(
                `${eBookConfig.new_server_prefix}/logger/runlog`,
                {
                    method: "POST",
                    headers: this.jsonHeaders,
                    body: JSON.stringify(eventInfo),
                }
            );
            let response = await fetch(request);
            if (!response.ok) {
                post_promise = await response.json();
                if (eBookConfig.useRunestoneServices) {
                    alert(`Failed to save your code
                        Status is ${response.status}
                        Detail: ${JSON.stringify(
                        post_promise.detail,
                        null,
                        4
                    )}`);
                } else {
                    console.log(
                        `Did not save the code.
                         Status: ${response.status}
                         Detail: ${JSON.stringify(
                            post_promise.detail,
                            null,
                            4
                        )}`
                    );
                }
            } else {
                post_promise = await response.json();
            }
        }
        if (!this.isTimed || eBookConfig.debug) {
            console.log("running " + JSON.stringify(eventInfo));
        }
        if (
            typeof pageProgressTracker.updateProgress === "function" &&
            this.optional == false
        ) {
            pageProgressTracker.updateProgress(eventInfo.div_id);
        }
        return post_promise;
    }
    /* Checking/loading from storage
    **WARNING:**  DO NOT `await` this function!
    This function, although async, does not explicitly resolve its promise by returning a value.  The reason for this is because it is called by the constructor for nearly every component.  In Javascript constructors cannot be async!

    One of the recommended ways to handle the async requirements from within a constructor is to use an attribute as a promise and resolve that attribute at the appropriate time.
    */
    async checkServer(
        // A string specifying the event name to use for querying the :ref:`getAssessResults` endpoint.
        eventInfo,
        // If true, this function will invoke ``indicate_component_ready()`` just before it returns. This is provided since most components are ready after this function completes its work.
        //
        // TODO: This defaults to false, to avoid causing problems with any components that haven't been updated and tested. After all Runestone components have been updated, default this to true and remove the extra parameter from most calls to this function.
        will_be_ready = false
    ) {
        // Check if the server has stored answer
        let self = this;
        this.checkServerComplete = new Promise(function (resolve, reject) {
            self.csresolver = resolve;
        });
        if (
            eBookConfig.isLoggedIn &&
            (this.useRunestoneServices || this.graderactive)
        ) {
            let data = {};
            data.div_id = this.divid;
            data.course = eBookConfig.course;
            data.event = eventInfo;
            if (this.graderactive && this.deadline) {
                data.deadline = this.deadline;
                data.rawdeadline = this.rawdeadline;
                data.tzoff = this.tzoff;
            }
            if (this.sid) {
                data.sid = this.sid;
            }
            if (!(data.div_id && data.course && data.event)) {
                console.log(
                    `A required field is missing data ${data.div_id}:${data.course}:${data.event}`
                );
            }
            // If we are NOT in practice mode and we are not in a peer exercise
            // and assessmentTaken is true
            if (
                !eBookConfig.practice_mode &&
                !eBookConfig.peer &&
                this.assessmentTaken
            ) {
                let request = new Request(
                    `${eBookConfig.new_server_prefix}/assessment/results`,
                    {
                        method: "POST",
                        body: JSON.stringify(data),
                        headers: this.jsonHeaders,
                    }
                );
                try {
                    let response = await fetch(request);
                    if (response.ok) {
                        data = await response.json();
                        data = data.detail;
                        this.repopulateFromStorage(data);
                        this.attempted = true;
                        if (typeof data.correct !== "undefined") {
                            this.correct = data.correct;
                        } else {
                            this.correct = null;
                        }
                        this.csresolver("server");
                    } else {
                        console.log(
                            `HTTP Error getting results: ${response.statusText}`
                        );
                        this.checkLocalStorage(); // just go right to local storage
                        this.csresolver("local");
                    }
                } catch (err) {
                    console.log(`Error getting results: ${err}`);
                    try {
                        this.checkLocalStorage();
                    } catch (err) {
                        console.log(err);
                    }
                }
            } else {
                this.loadData({});
                this.csresolver("not taken");
            }
        } else {
            this.checkLocalStorage(); // just go right to local storage
            this.csresolver("local");
        }

        if (will_be_ready) {
            this.indicate_component_ready();
        }
    }

    // This method assumes that ``this.componentDiv`` refers to the ``div`` containing the component, and that this component's ID is set.
    indicate_component_ready() {
        // Add a class to indicate the component is now ready.
        this.containerDiv.classList.add("runestone-component-ready");
        // Resolve the ``this.component_ready_promise``.
        this._component_ready_resolve_fn();
    }

    loadData(data) {
        // for most classes, loadData doesn't do anything. But for Parsons, and perhaps others in the future,
        // initialization can happen even when there's no history to be loaded
        return null;
    }

    /**
     * repopulateFromStorage is called after a successful API call is made to ``getAssessResults`` in
     * the checkServer method in this class
     *
     * ``restoreAnswers,`` ``setLocalStorage`` and ``checkLocalStorage`` are defined in the child classes.
     *
     * @param {*} data - a JSON object representing the data needed to restore a previous answer for a component
     * @param {*} status - the http status
     * @param {*} whatever - ignored
     */
    repopulateFromStorage(data) {
        // decide whether to use the server's answer (if there is one) or to load from storage
        if (data !== null && data !== "no data" && this.shouldUseServer(data)) {
            this.restoreAnswers(data);
            this.setLocalStorage(data);
        } else {
            this.checkLocalStorage();
        }
        this.decorateStatus();
    }
    shouldUseServer(data) {
        // returns true if server data is more recent than local storage or if server storage is correct
        if (
            data.correct === "T" ||
            data.correct === true ||
            localStorage.length === 0 ||
            this.graderactive === true ||
            this.isTimed
        ) {
            return true;
        }
        let ex = localStorage.getItem(this.localStorageKey());
        if (ex === null) {
            return true;
        }
        let storedData;
        try {
            storedData = JSON.parse(ex);
        } catch (err) {
            // error while parsing; likely due to bad value stored in storage
            console.log(err.message);
            localStorage.removeItem(this.localStorageKey());
            // definitely don't want to use local storage here
            return true;
        }
        if (data.answer == storedData.answer) return true;
        let storageDate = new Date(storedData.timestamp);
        let serverDate = new Date(data.timestamp);
        return serverDate >= storageDate;
    }
    // Return the key which to be used when accessing local storage.
    localStorageKey() {
        return (
            eBookConfig.email +
            ":" +
            eBookConfig.course +
            ":" +
            this.divid +
            "-given"
        );
    }
    addCaption(elType) {
        //someElement.parentNode.insertBefore(newElement, someElement.nextSibling);
        if (!this.isTimed) {
            var capDiv = document.createElement("p");
            if (this.question_label) {
                // Display caption based on whether Runestone services have been detected
                this.caption = eBookConfig.useRunestoneServices
                    ? `Activity: ${this.question_label} ${this.caption}  <span class="runestone_caption_divid">(${this.divid})</span>`
                    : `Activity: ${this.question_label} ${this.caption}`; // Without runestone
                $(capDiv).html(this.caption);
                $(capDiv).addClass(`${elType}_caption`);
            } else {
                // Display caption based on whether Runestone services have been detected
                $(capDiv).html(
                    eBookConfig.useRunestoneServices
                        ? this.caption + " (" + this.divid + ")"
                        : this.caption
                ); // Without runestone
                $(capDiv).addClass(`${elType}_caption`);
                $(capDiv).addClass(`${elType}_caption_text`);
            }
            this.capDiv = capDiv;
            //this.outerDiv.parentNode.insertBefore(capDiv, this.outerDiv.nextSibling);
            this.containerDiv.appendChild(capDiv);
        }
    }

    hasUserActivity() {
        return this.isAnswered;
    }

    checkCurrentAnswer() {
        console.log(
            "Each component should provide an implementation of checkCurrentAnswer"
        );
    }

    async logCurrentAnswer() {
        console.log(
            "Each component should provide an implementation of logCurrentAnswer"
        );
    }
    renderFeedback() {
        console.log(
            "Each component should provide an implementation of renderFeedback"
        );
    }
    disableInteraction() {
        console.log(
            "Each component should provide an implementation of disableInteraction"
        );
    }

    toString() {
        return `${this.constructor.name}: ${this.divid}`;
    }

    queueMathJax(component) {
        if (typeof MathJax === "undefined") {
            console.log("Error -- MathJax is not loaded");
            return Promise.resolve(null);
        } else {
            // See - https://docs.mathjax.org/en/latest/advanced/typeset.html
            // Per the above we should keep track of the promises and only call this
            // a second time if all previous promises have resolved.
            // Create a queue of components
            // should wait until defaultPageReady is defined
            // If defaultPageReady is not defined then just enqueue the components.
            // Once defaultPageReady is defined
            // the window.runestoneMathReady promise will be fulfilled when the
            // initial typesetting is complete.
            if (MathJax.typesetPromise) {
                if (typeof window.runestoneMathReady !== "undefined") {
                    return window.runestoneMathReady.then(() =>
                        this.mjresolver(this.aQueue.enqueue(component))
                    );
                } else {
                    return this.mjresolver(this.aQueue.enqueue(component));
                }
            } else {
                console.log(`Waiting on MathJax!! ${MathJax.typesetPromise}`);
                setTimeout(() => this.queueMathJax(component), 200);
                console.log(`Returning mjready promise: ${this.mjReady}`);
                return this.mjReady;
            }
        }
    }

    decorateStatus() {
        if (this.isTimed || eBookConfig.peer) return;
        let rsDiv = $(this.containerDiv).closest("div.runestone")[0];
        if (!rsDiv) return;
        rsDiv.classList.remove("notAnswered");
        rsDiv.classList.remove("isInCorrect");
        rsDiv.classList.remove("isCorrect");
        if (this.correct) {
            rsDiv.classList.add("isCorrect");
        } else {
            if (this.correct === null || typeof this.correct === "undefined") {
                rsDiv.classList.add("notAnswered");
            } else {
                rsDiv.classList.add("isInCorrect");
            }
        }
    }
}

// Inspiration and lots of code for this solution come from
// https://stackoverflow.com/questions/53540348/js-async-await-tasks-queue
// The idea here is that until MathJax is ready we can just enqueue things
// once mathjax becomes ready then we can drain the queue and continue as usual.

class Queue {
    constructor() {
        this._items = [];
    }
    enqueue(item) {
        this._items.push(item);
    }
    dequeue() {
        return this._items.shift();
    }
    get size() {
        return this._items.length;
    }
}

class AutoQueue extends Queue {
    constructor() {
        super();
        this._pendingPromise = false;
    }

    enqueue(component) {
        return new Promise((resolve, reject) => {
            super.enqueue({ component, resolve, reject });
            this.dequeue();
        });
    }

    async dequeue() {
        if (this._pendingPromise) return false;

        let item = super.dequeue();

        if (!item) return false;
        let qq = this;
        try {
            this._pendingPromise = true;

            let payload = await window.runestoneMathReady
                .then(async function () {
                    console.log(
                        `MathJax Ready -- dequeing a typesetting run for ${item.component.id} ${qq.preamble?.innerHTML}`
                    );
                    if (qq.preamble) {
                        await MathJax.typesetPromise([qq.preamble])
                        item.component.innerHTML = "<div>" +
                            qq.preamble.innerHTML + "</div>" + item.component.innerHTML;
                        console.log(
                            `MathJax typeset the preamble for ${item.component.id}`
                        );
                        return await MathJax.typesetPromise([item.component]);
                    } else {
                        return await MathJax.typesetPromise([item.component]);
                    }
                });

            this._pendingPromise = false;
            item.resolve(payload);
        } catch (e) {
            this._pendingPromise = false;
            item.reject(e);
        } finally {
            // If there are more items in the queue, continue processing them
            this.dequeue();
        }

        return true;
    }
}

window.RunestoneBase = RunestoneBase;
