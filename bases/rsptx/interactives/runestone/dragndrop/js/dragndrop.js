/*==========================================
=======     Master dragndrop.js     ========
============================================
===     This file contains the JS for    ===
=== the Runestone Drag n drop component. ===
============================================
===              Created by              ===
===           Isaiah Mayerchak           ===
===                7/6/15                ===
===              Brad MIller             ===
===                2/7/19                ===
===               12/30/24               ===
==========================================*/

/*
 * Some terminology:
 * - draggable: the element that is being dragged
 * - dropzone: the element that is being dropped on
 * - premise: the element that is being dragged
 * - response: the element that is being dropped on
 * - category: each premis and response have a category.  Several premises can have the same category
 * and be dropped onto the same response.  If a premise has no response its category will not be in
 * the list of categories.
 *
 * Key variables:
 * - dragArray: an array of draggable elements
 * - dropArray: an array of dropzone elements
 * - categories: an array of all categories
 */
"use strict";

import RunestoneBase from "../../common/js/runestonebase.js";
import "../css/dragndrop.less";
import "./dragndrop-i18n.en.js";
import "./dragndrop-i18n.pt-br.js";
//import "./DragDropTouch.js";

export default class DragNDrop extends RunestoneBase {
    constructor(opts) {
        super(opts);
        var orig = opts.orig; // entire <ul> element that will be replaced by new HTML
        this.origElem = orig;
        this.divid = orig.id;
        this.useRunestoneServices = opts.useRunestoneServices;
        this.random = true;
        //check if the original element has a data-random attribute set to the value "no"
        if (this.origElem.dataset.random === "no") {
            this.random = false;
        }
        this.feedback = "";
        this.question = "";
        this.populate(); // Populates this.responseArray, this.premiseArray, this.feedback and this.question
        this.createNewElements();
        this.caption = "Drag-N-Drop";
        this.addCaption("runestone");
        if (typeof Prism !== "undefined") {
            Prism.highlightAllUnder(this.containerDiv);
        }
    }

    /*======================
    === Update variables ===
    ======================*/
    populate() {
        this.responseArray = [];
        this.premiseArray = [];
        let invisibleErrorDiv = document.createElement("div");
        invisibleErrorDiv.classList.add("ptx-runestone-container");
        document.body.appendChild(invisibleErrorDiv);

        for (let element of this.origElem.querySelectorAll(
            "[data-subcomponent='draggable']"
        )) {
            let replaceSpan = document.createElement("span");
            replaceSpan.innerHTML = element.innerHTML;
            replaceSpan.id = element.id;
            replaceSpan.setAttribute("draggable", "true");
            replaceSpan.classList.add("draggable-drag");
            replaceSpan.classList.add("premise");
            replaceSpan.tabIndex = 0;
            replaceSpan.setAttribute('role', 'button');
            replaceSpan.dataset.category = this.getCategory(element);
            replaceSpan.dataset.parent_id = this.divid;
            this.premiseArray.push(replaceSpan);
            this.setDragListeners(replaceSpan);
            // now create an error message for when the premise is dropped in the wrong place
            let errorMessage = document.createElement("div");
            errorMessage.classList.add("vh-dnd-error");
            errorMessage.innerHTML = "Incorrect drop zone for " + replaceSpan.innerHTML;
            errorMessage.setAttribute("role", "alert");
            errorMessage.id = replaceSpan.id + "_error";
            invisibleErrorDiv.appendChild(errorMessage);
        }
        if (this.random) {
            // Shuffle the premiseArray if random is true
            this.premiseArray = shuffleArray(this.premiseArray);
        }
        for (let element of this.origElem.querySelectorAll(
            "[data-subcomponent='dropzone']"
        )) {
            let replaceSpan = document.createElement("span");
            replaceSpan.innerHTML = element.innerHTML;
            replaceSpan.id = element
                .getAttribute("for")
                .replace("drag", "drop");
            replaceSpan.classList.add(
                "draggable-drop",
                "drop-label",
                "response"
            );
            replaceSpan.tabIndex = 0;
            replaceSpan.setAttribute('role', 'button');
            replaceSpan.dataset.category = this.getCategory(element);
            replaceSpan.dataset.parent_id = this.divid;
            this.responseArray.push(replaceSpan);
            this.setDropListeners(replaceSpan);
        }

        this.question = this.origElem.querySelector(
            "[data-subcomponent='question']"
        ).innerHTML;
        let feedback = this.origElem.querySelector(
            "[data-subcomponent='feedback']"
        );
        if (feedback) {
            this.feedback = feedback.innerHTML;
        }
    }

    getCategory(elem) {
        if (elem.dataset.category) {
            return elem.dataset.category;
        } else {
            // if no category then use the for attribute or the id
            // this is for backwards compatibility
            if (elem.hasAttribute("for")) {
                return elem.getAttribute("for");
            } else {
                return elem.id;
            }
        }
    }
    /*========================================
    == Create new HTML elements and replace ==
    ==      original element with them      ==
    ========================================*/
    createNewElements() {
        this.containerDiv = document.createElement("div");
        this.containerDiv.id = this.divid;
        this.containerDiv.classList.add("draggable-container");
        this.statementDiv = document.createElement("div");
        this.statementDiv.classList.add("cardsort-statement");
        this.statementDiv.innerHTML = this.question;
        this.containerDiv.appendChild(this.statementDiv);
        this.containerDiv.appendChild(document.createElement("br"));
        this.dragDropWrapDiv = document.createElement("div"); // Holds the draggables/dropzones, prevents feedback from bleeding in
        this.dragDropWrapDiv.style.display = "block";
        this.containerDiv.appendChild(this.dragDropWrapDiv);
        this.draggableDiv = document.createElement("div");
        this.draggableDiv.classList.add("rsdraggable", "dragzone");
        this.addDragDivListeners();
        this.dropZoneDiv = document.createElement("div");
        this.dropZoneDiv.classList.add("rsdraggable");
        this.dragDropWrapDiv.appendChild(this.draggableDiv);
        this.dragDropWrapDiv.appendChild(this.dropZoneDiv);
        this.createButtons();
        this.checkServer("dragNdrop", true);
        if (eBookConfig.practice_mode) {
            this.finishSettingUp();
        }
        self = this;
        this.ivp = this.isValidPremise.bind(this);
        self.queueMathJax(self.containerDiv);
    }

    finishSettingUp() {
        this.appendReplacementSpans();
        this.createFeedbackDiv();
        this.origElem.parentNode.replaceChild(this.containerDiv, this.origElem);
        if (!this.hasStoredDropzones) {
            this.minheight = this.draggableDiv.offsetHeight;
            // Ensure MathJax has completed before adjusting the zone widths
            this.queueMathJax(this.containerDiv).then(() => {
                this.adjustDragDropWidths();
            });
        }
        this.draggableDiv.style.minHeight = this.minheight.toString() + "px";
        if (this.dropZoneDiv.offsetHeight > this.minheight) {
            this.dragDropWrapDiv.style.minHeight =
                this.dropZoneDiv.offsetHeight.toString() + "px";
        } else {
            this.dragDropWrapDiv.style.minHeight =
                this.minheight.toString() + "px";
        }
        this.draggableDiv.style.width = `${this.dragwidth}%`;
        this.dropZoneDiv.style.width = `${this.dropwidth}%`;
    }
    addDragDivListeners() {
        let self = this;
        this.draggableDiv.addEventListener(
            "dragover",
            function (ev) {
                ev.preventDefault();
                if (this.draggableDiv.classList.contains("possibleDrop")) {
                    return;
                }
                this.draggableDiv.classList.add("possibleDrop");
            }.bind(this)
        );
        this.draggableDiv.addEventListener(
            "drop",
            function (ev) {
                self.isAnswered = true;
                ev.preventDefault();
                if (this.draggableDiv.classList.contains("possibleDrop")) {
                    this.draggableDiv.classList.remove("possibleDrop");
                }
                var data = ev.dataTransfer.getData("draggableID");
                var draggedSpan = document.getElementById(data);
                if (
                    !this.draggableDiv.contains(draggedSpan) &&
                    !this.strangerDanger(draggedSpan)
                ) {
                    // Make sure element isn't already there--prevents erros w/appending child
                    this.draggableDiv.appendChild(draggedSpan);
                    this.adjustDragDropWidths();
                    this.minheight = this.draggableDiv.offsetHeight;
                    this.dragDropWrapDiv.style.minHeight =
                        this.minheight.toString() + "px";
                }
            }.bind(this)
        );
        this.draggableDiv.addEventListener(
            "dragleave",
            function (e) {
                if (!this.draggableDiv.classList.contains("possibleDrop")) {
                    return;
                }
                this.draggableDiv.classList.remove("possibleDrop");
            }.bind(this)
        );
    }
    createButtons() {
        this.buttonDiv = document.createElement("div");
        this.buttonDiv.classList.add("dnd-button-container");
        this.submitButton = document.createElement("button"); // Check me button
        this.submitButton.textContent = $.i18n("msg_dragndrop_check_me");
        this.submitButton.setAttribute("class", "btn btn-success drag-button");
        this.submitButton.setAttribute("name", "do answer");
        this.submitButton.setAttribute("type", "button");
        this.submitButton.onclick = function () {
            this.checkCurrentAnswer();
            this.renderFeedback();
            this.logCurrentAnswer();
        }.bind(this);
        this.resetButton = document.createElement("button"); // Check me button
        this.resetButton.textContent = $.i18n("msg_dragndrop_reset");
        this.resetButton.setAttribute(
            "class",
            "btn btn-default drag-button drag-reset"
        );
        this.resetButton.setAttribute("name", "do answer");
        this.resetButton.onclick = function () {
            this.resetDraggables();
        }.bind(this);
        this.buttonDiv.appendChild(this.submitButton);
        this.buttonDiv.appendChild(this.resetButton);
        this.containerDiv.appendChild(this.buttonDiv);
    }
    appendReplacementSpans() {
        if (
            this.answerState === undefined ||
            Object.keys(this.answerState).length === 0
        ) {
            this.answerState = {};
            for (let element of this.premiseArray) {
                this.draggableDiv.appendChild(element);
            }
            for (let element of this.responseArray) {
                this.dropZoneDiv.appendChild(element);
            }
        } else {
            let placedPremises = [];
            for (let response of this.responseArray) {
                this.dropZoneDiv.appendChild(response);
                if (this.answerState[response.id]) {
                    for (let premise of this.answerState[response.id]) {
                        placedPremises.push(premise);
                        let foundPremise = this.findPremise(premise);
                        if (foundPremise) {
                            response.appendChild(foundPremise);
                        } else {
                            console.warn(
                                `Premise with ID ${premise} not found in premiseArray`
                            );
                        }
                    }
                }
            }
            for (let premise of this.premiseArray) {
                if (placedPremises.indexOf(premise.id) == -1) {
                    this.draggableDiv.appendChild(premise);
                }
            }
        }
    }

    findPremise(id) {
        for (let premise of this.premiseArray) {
            if (premise.id == id) {
                return premise;
            }
        }
    }

    countSavedPremises() {
        // Count how many premises are saved in the answerState
        let count = 0;
        let names = {};
        for (let response of this.answerState) {
            if (response.length > 0) {
                for (let premise of response) {
                    if (!names[premise]) {
                        count++;
                        names[premise] = true;
                    }
                }
            }
        }
        return count;
    }

    setDragListeners(dgSpan) {
        let self = this;
        dgSpan.addEventListener("dragstart", function (ev) {
            ev.dataTransfer.setData("draggableID", ev.target.id);
        });
        dgSpan.addEventListener("dragover", function (ev) {
            ev.preventDefault();
        });
        dgSpan.addEventListener(
            "drop",
            function (ev) {
                self.isAnswered = true;
                ev.preventDefault();
                var data = ev.dataTransfer.getData("draggableID");
                var draggedSpan = document.getElementById(data);
                if (
                    draggedSpan != ev.target &&
                    !this.strangerDanger(draggedSpan)
                ) {
                    // Make sure element isn't already there--prevents errors w/appending child
                    this.draggableDiv.appendChild(draggedSpan);
                }
            }.bind(this)
        );

        // Add keyboard navigation for selecting premises
        dgSpan.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                if (!self.selectedPremise) {
                    self.selectedPremise = dgSpan;
                    dgSpan.classList.add("selected");
                } else {
                    self.selectedPremise.classList.remove("selected");
                    self.selectedPremise = null;
                }
            }
        });
    }

    setDropListeners(dpSpan) {
        dpSpan.addEventListener(
            "dragover",
            function (ev) {
                self.isAnswered = true;
                ev.preventDefault();
                if (ev.target.classList.contains("possibleDrop")) {
                    return;
                }
                if (ev.target.classList.contains("draggable-drop")) {
                    ev.target.classList.add("possibleDrop");
                }
            }.bind(this)
        );
        dpSpan.addEventListener("dragleave", function (ev) {
            self.isAnswered = true;
            ev.preventDefault();
            if (!ev.target.classList.contains("possibleDrop")) {
                return;
            }
            ev.target.classList.remove("possibleDrop");
        });
        dpSpan.addEventListener(
            "drop",
            function (ev) {
                self.isAnswered = true;
                ev.preventDefault();
                if (ev.target.classList.contains("possibleDrop")) {
                    ev.target.classList.remove("possibleDrop");
                }
                var data = ev.dataTransfer.getData("draggableID");
                var draggedSpan = document.getElementById(data);
                if (
                    ev.target.classList.contains("draggable-drop") &&
                    !this.strangerDanger(draggedSpan) &&
                    !this.premiseArray.includes(ev.target) // don't drop on another premise!
                ) {
                    // Make sure element isn't already there--prevents errors w/appending child
                    ev.target.appendChild(draggedSpan);
                }
                this.queueMathJax(this.containerDiv).then(() => {
                    this.adjustDragDropWidths();
                });
            }.bind(this)
        );

        // Add keyboard navigation for dropping premises
        dpSpan.addEventListener("keydown", function (ev) {
            if ((ev.key === "Enter" || ev.key === " ") && self.selectedPremise) {
                ev.preventDefault();
                if (
                    !self.strangerDanger(self.selectedPremise) &&
                    !self.premiseArray.includes(dpSpan) // don't drop on another premise!
                ) {
                    dpSpan.appendChild(self.selectedPremise);
                    self.selectedPremise.classList.remove("selected");
                    self.selectedPremise = null;
                    self.queueMathJax(self.containerDiv).then(() => {
                        self.adjustDragDropWidths();
                    });
                }
            }
        });
    }

    adjustDragDropWidths() {
        // Temporarily minimize the dragzone width to the content
        this.draggableDiv.style.width = "fit-content";

        const dragzoneWidth = this.draggableDiv.offsetWidth;
        const totalWidth = this.dragDropWrapDiv.offsetWidth;

        let dragzonePercent = Math.ceil((dragzoneWidth / totalWidth) * 100);
        dragzonePercent = Math.max(28, Math.min(dragzonePercent, 48));
        const dropzonePercent = 100 - dragzonePercent - 4; // 4 accounts for zone padding

        this.dragwidth = dragzonePercent;
        this.dropwidth = dropzonePercent;

        this.draggableDiv.style.width = `${dragzonePercent}%`;
        this.dropZoneDiv.style.width = `${dropzonePercent}%`;
    }

    createFeedbackDiv() {
        if (!this.feedBackDiv) {
            this.feedBackDiv = document.createElement("div");
            this.feedBackDiv.id = this.divid + "_feedback";
            this.feedBackDiv.setAttribute("aria-live", "polite");
            this.feedBackDiv.setAttribute("role", "status");
            this.containerDiv.appendChild(document.createElement("br"));
            this.containerDiv.appendChild(this.feedBackDiv);
        }
    }
    /*=======================
    == Auxiliary functions ==
    =======================*/
    /* leaving the name as is, because it reminds me of Isaiah! */
    strangerDanger(testSpan) {
        // Returns true if the test span doesn't belong to this instance of DragNDrop
        if (testSpan.dataset.parent_id != this.divid) {
            return true;
        } else {
            return false;
        }
    }
    /*==============================
    == Reset button functionality ==
    ==============================*/
    resetDraggables() {
        this.dropZoneDiv.innerHTML = "";
        for (let response of this.responseArray) {
            response.classList.remove("drop-incorrect");
            this.dropZoneDiv.appendChild(response);
        }
        this.draggableDiv.innerHTML = "";
        // Shuffle the premiseArray if random is true
        if (this.random) {
            this.premiseArray = shuffleArray(this.premiseArray);
        }
        for (let premise of this.premiseArray) {
            this.draggableDiv.appendChild(premise);
        }
        this.answerState = {};
        this.feedBackDiv.style.display = "none";
        this.adjustDragDropWidths();
        this.minheight = this.draggableDiv.offsetHeight;
        this.dragDropWrapDiv.style.minHeight =
            this.minheight.toString() + "px";
        this.feedBackDiv.style.visibility = "hidden";
    }
    /*===========================
    == Evaluation and feedback ==
    ===========================*/
    getAllCategories() {
        this.categories = [];
        for (let response of this.dropZoneDiv.childNodes) {
            this.categories.push(response.dataset.category);
        }
        return this.categories;
    }

    checkCurrentAnswer() {
        let categories = this.getAllCategories();
        this.correct = true;
        this.unansweredNum = 0;
        this.incorrectNum = 0;
        this.correctNum = 0;
        this.dragNum = this.premiseArray.length;

        for (let response of this.dropZoneDiv.childNodes) {
            // ignore drop zone children that aren't premises
            for (let premise of Array.from(response.childNodes).filter(
                this.ivp
            )) {
                if (premise.dataset.category == response.dataset.category) {
                    this.correctNum++;
                } else {
                    this.incorrectNum++;
                }
            }
        }
        for (let premise of Array.from(this.draggableDiv.childNodes).filter(
            (node) => node.nodeType !== Node.TEXT_NODE
        )) {
            if (categories.indexOf(premise.dataset.category) == -1) {
                this.correctNum++;
            } else {
                this.unansweredNum++;
            }
        }
        this.percent = this.correctNum / this.premiseArray.length;
        console.log(this.percent, this.incorrectNum, this.unansweredNum);
        if (this.percent < 1.0) {
            this.correct = false;
        }
        this.setLocalStorage({ correct: this.correct ? "T" : "F" });
    }

    isCorrectDrop(response) {
        // Returns true if all premises in the response are in the correct category
        // and all premises in the category are in the response
        // used by renderFeedback
        let correct = true;
        let correctPlacements = 0;
        for (let premise of Array.from(response.childNodes).filter(this.ivp)) {
            if (premise.dataset.category != response.dataset.category) {
                correct = false;
            } else {
                correctPlacements++;
            }
        }
        let catCount = 0;
        for (let premis of this.premiseArray) {
            if (premis.dataset.category == response.dataset.category) {
                catCount++;
            }
        }
        return correct && correctPlacements == catCount;
    }

    isValidPremise(premise) {
        if (this.premiseArray.includes(premise)) {
            return true;
        } else {
            return false;
        }
    }

    async logCurrentAnswer(sid) {
        let answer = JSON.stringify(this.answerState);
        let data = {
            event: "dragNdrop",
            act: answer,
            answer: answer,
            min_height: Math.round(this.minheight),
            drag_width: this.dragwidth,
            drop_width: this.dropwidth,
            div_id: this.divid,
            correct: this.correct,
            correctNum: this.correctNum,
            dragNum: this.dragNum,
        };
        if (typeof sid !== "undefined") {
            data.sid = sid;
        }
        await this.logBookEvent(data);
    }
    renderFeedback() {
        for (let response of this.dropZoneDiv.childNodes) {
            // iterate over all the premises in the response
            for (let premise of Array.from(response.childNodes).filter(
                this.ivp
            )) {
                // if the premise is not in the correct category, add the class
                if (
                    premise.dataset.category != response.dataset.category
                ) {
                    premise.classList.add("drop-incorrect");
                    premise.setAttribute("aria-invalid", "true");
                    premise.setAttribute(
                        "aria-errormessage",
                        premise.id + "_error"
                    );
                    document.getElementById(
                        premise.id + "_error"
                    ).classList.remove("vh-dnd-error");
                } else {
                    premise.classList.remove("drop-incorrect");
                    premise.setAttribute("aria-invalid", "false");
                    premise.removeAttribute("aria-errormessage");
                }
            }
        }
        if (!this.feedBackDiv) {
            this.createFeedbackDiv();
        }
        this.feedBackDiv.style.visibility = "visible";
        if (this.correct) {
            var msgCorrect = $.i18n("msg_dragndrop_correct_answer");
            setTimeout(() => {
                this.feedBackDiv.innerHTML = msgCorrect;
            }, 10);
            this.feedBackDiv.className = "alert alert-info draggable-feedback";

        } else {
            var msgIncorrect = $.i18n(
                $.i18n("msg_dragndrop_incorrect_answer"),
                this.correctNum,
                this.incorrectNum,
                this.dragNum,
                this.unansweredNum
            );
            // this.feedback comes from the author (a hint maybe)
            setTimeout(() => {
                this.feedBackDiv.innerHTML = msgIncorrect + " " + this.feedback;
            }, 10);
            this.feedBackDiv.className =
                "alert alert-danger draggable-feedback";
        }
        this.queueMathJax(this.feedBackDiv);
    }
    /*===================================
    === Checking/restoring from storage ===
    ===================================*/
    restoreAnswers(data) {
        // Restore answers from storage retrieval done in RunestoneBase
        this.hasStoredDropzones = true;
        this.minheight = data.min_height;
        this.dragwidth = data.drag_width;
        this.dropwidth = data.drop_width;
        this.answerState = JSON.parse(data.answer);
        this.correct = data.correct;
        this.finishSettingUp();
    }

    checkLocalStorage() {
        if (this.graderactive) {
            return;
        }
        var storedObj;
        this.hasStoredDropzones = false;
        var len = localStorage.length;
        if (len > 0) {
            var ex = localStorage.getItem(this.localStorageKey());
            if (ex !== null) {
                this.hasStoredDropzones = true;
                try {
                    storedObj = JSON.parse(ex);
                    this.minheight = storedObj.min_height;
                    this.dragwidth = storedObj.drag_width;
                    this.dropwidth = storedObj.drop_width;
                } catch (err) {
                    // error while parsing; likely due to bad value stored in storage
                    console.log(err.message);
                    localStorage.removeItem(this.localStorageKey());
                    this.hasStoredDropzones = false;
                    this.finishSettingUp();
                    return;
                }
                this.answerState = storedObj.answer;
                if (this.useRunestoneServices) {
                    // store answer in database
                    let answer = JSON.stringify(this.answerState);
                    this.logBookEvent({
                        event: "dragNdrop",
                        act: answer,
                        answer: answer,
                        min_height: Math.round(this.minheight),
                        drag_width: this.dragwidth,
                        drop_width: this.dropwidth,
                        div_id: this.divid,
                        correct: storedObj.correct,
                    });
                }
            }
        }
        this.finishSettingUp();
    }

    setLocalStorage(data) {
        if (data.answer === undefined) {
            // If we didn't load from the server, we must generate the data
            this.answerState = {};
            for (let response of this.dropZoneDiv.childNodes) {
                this.answerState[response.id] = [];
                for (let premise of response.childNodes) {
                    if (
                        premise.nodeType !== Node.TEXT_NODE &&
                        this.premiseArray.includes(premise)
                    ) {
                        this.answerState[response.id].push(premise.id);
                    }
                }
            }
        }
        var timeStamp = new Date();
        var correct = data.correct;
        var storageObj = {
            answer: this.answerState,
            min_height: this.minheight,
            timestamp: timeStamp,
            correct: correct,
            drag_width: this.dragwidth,
            drop_width: this.dropwidth,
        };
        localStorage.setItem(
            this.localStorageKey(),
            JSON.stringify(storageObj)
        );
    }

    disableInteraction() {
        this.resetButton.style.display = "none";
        for (var i = 0; i < this.premiseArray.length; i++) {
            // No more dragging
            this.premiseArray[i].draggable = false;
            this.premiseArray[i].style.cursor = "initial";
        }
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        // Generate a random index between 0 and i
        const j = Math.floor(Math.random() * (i + 1));
        // Swap elements at indices i and j
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/*=================================
== Find the custom HTML tags and ==
==   execute our code on them    ==
=================================*/
document.addEventListener("runestone:login-complete", function () {
    const elements = document.querySelectorAll("[data-component=dragndrop]");
    elements.forEach((element) => {
        const opts = {
            orig: element,
            useRunestoneServices: eBookConfig.useRunestoneServices,
        };
        if (!element.closest("[data-component=timedAssessment]")) {
            // If this element exists within a timed component, don't render it here
            try {
                window.componentMap[element.id] = new DragNDrop(opts);
            } catch (err) {
                console.log(
                    `Error rendering DragNDrop Problem ${element.id}: ${err}`
                );
            }
        }
    });
});
