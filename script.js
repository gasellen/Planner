const SUPABASE_URL =
    "https://tihjysjsuwdqljhdctdk.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_bIppuHK8wUxnIZWkX0oxVg_QRA0KMCx";


const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );


// =================================
// THEMES
// =================================

const THEMES = {

    paper: {
        background: "#F7F4EC",
        text: "#3F4A3C",
        panel: "#FFFDF8",
        inputborder: "#DDD",
        task: "#E6EFE2",
        recurring: "#B8CFAF",
        grid: "#D8D5CB",
        drop: "rgb(242, 239, 231)",
        checkbox: "#cbe3c0ff",
        input: "#FFFFFF",
        panelborder: "transparent",
        taskborder: "transparent"
    },

    purple: {
        background: "#42486f",
        text: "#d1d1d1",
        panel: "#656c97",
        inputborder: "#000000",
        task: "#7577ad",
        recurring: "#101238ff",
        grid: "#9094ae",
        drop: "rgb(61, 67, 106)",
        checkbox: "#d1d1d1",
        input: "#4e5582ff",
        panelborder: "#000000",
        taskborder: "#000000"
    },

    blueCoral: {
        background: "#B6C2D9",
        text: "#ECE5F0",
        panel: "#456990",
        inputborder: "#3F4A3C",
        task: "#CE6C47",
        recurring: "#456990",
        grid: "#ECE5F0",
        drop: "#96a6c5ff",
        checkbox: "#9e4e31ff",
        input: "#CE6C47",
        panelborder: "#3F4A3C",
        taskborder: "#3F4A3C"
    },

    sunset: {
        background: "#F4E1D2",
        text: "#4A3B35",
        panel: "#FFF8F2",
        inputborder: "#C9A99A",
        task: "#E6A57E",
        recurring: "#FFF8F2",
        grid: "#D9C3B8",
        drop: "#C97B63",
        checkbox: "#f9f7f3ff",
        input: "#FFFFFF",
        panelborder: "#C9A99A",
        taskborder: "transparent"
    }

};


// =================================
// APPLY THEME
// =================================

function applyTheme(themeName) {

    const theme =
        THEMES[themeName];

    if (!theme) {
        return;
    }

    Object.entries(theme).forEach(
        function([name, value]) {

            document.documentElement.style.setProperty(
                `--${name}`,
                value
            );

        }
    );

    localStorage.setItem(
        "plannerTheme",
        themeName
    );

}


// =================================
// THEME MENU
// =================================

const themeOptions =
    document.querySelectorAll(".theme-option");


themeOptions.forEach(
    function(option) {

        option.addEventListener(
            "click",
            function() {

                const themeName =
                    option.dataset.theme;

                applyTheme(themeName);

            }
        );

    }
);


// =================================
// LOAD SAVED THEME
// =================================

const savedTheme =
    localStorage.getItem("plannerTheme");


applyTheme(
    savedTheme || "paper"
);


// =================================
// CALENDAR CONFIGURATION
// =================================

const CALENDAR_CONFIG = {

    startHour: 7,

    endHour: 24,

    minutesPerSlot: 5,

    slotHeight: 6,

    weekdays: 5,

    weekendDays: 2

};


// =================================
// DERIVED VALUES
// =================================

const TOTAL_MINUTES =
    (
        CALENDAR_CONFIG.endHour -
        CALENDAR_CONFIG.startHour
    ) * 60;


const TOTAL_SLOTS =
    TOTAL_MINUTES /
    CALENDAR_CONFIG.minutesPerSlot;


// =================================
// APPLICATION STATE
// =================================

let tasks =
    JSON.parse(
        localStorage.getItem("plannerTasks")
    ) || [];


let draggedTask = null;

let draggedTaskOccurrenceDate = null;

let dragOffsetY = 0;

let resizingTask = null;

let resizingElement = null;

let resizeStartY = 0;

let resizeStartHeight = 0;

let currentWeekStart = new Date();

let recurringEditMode = false;


// =================================
// SUPABASE SAVE
// =================================

async function saveTasks() {

    // Keep localStorage as a backup.
    localStorage.setItem(
        "plannerTasks",
        JSON.stringify(tasks)
    );


    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();


    if (userError || !user) {

        console.error(
            "Could not get logged-in user:",
            userError
        );

        return false;

    }


    const tasksToSave =
        tasks.map(
            function(task) {

                return {

                    id: task.id,

                    name: task.name,

                    date: task.date,

                    start_time:
                        task.startTime,

                    duration:
                        task.duration,

                    type: task.type,

                    recurrence:
                        task.recurrence || null,

                    user_id:
                        user.id,

                    completed:
                        task.completed

                };

            }
        );


    if (tasksToSave.length === 0) {

        return true;

    }


    const {
        error
    } = await supabaseClient
        .from("tasks")
        .upsert(
            tasksToSave,
            {
                onConflict: "id"
            }
        );


    if (error) {

        console.error(
            "Failed to save tasks to Supabase:",
            error
        );

        return false;

    }


    console.log(
        "Tasks saved to Supabase."
    );


    return true;

}


// =================================
// DELETE TASK FROM SUPABASE
// =================================

async function deleteTaskFromSupabase(
    taskId
) {

    const {
        error
    } = await supabaseClient
        .from("tasks")
        .delete()
        .eq(
            "id",
            taskId
        );


    if (error) {

        console.error(
            "Failed to delete task from Supabase:",
            error
        );

        return false;

    }


    console.log(
        "Task deleted from Supabase:",
        taskId
    );


    return true;

}


// =================================
// RECURRING TASK HELPERS
// =================================

function isRecurringTask(task) {

    return task.type === "recurring";

}


// =================================
// CREATE RECURRING TASK
// =================================

function createRecurringTask(
    name,
    startDate
) {

    return {

        id: Date.now(),

        name: name,

        completed: false,

        date: null,

        startTime: null,

        duration: 30,

        type: "recurring",

        recurrence: {

            startDate: startDate,

            weekday: null,

            endDate: null,

            deletedDates: []

        }

    };

}


// =================================
// RECURRING TASK OCCURRENCE
// =================================

function recurringTaskOccursOnDate(
    task,
    date
) {

    if (!isRecurringTask(task)) {
        return false;
    }


    if (
        task.recurrence.weekday === null ||
        task.startTime === null
    ) {

        return false;

    }


    const targetDate =
        new Date(
            `${date}T00:00:00`
        );


    const startDate =
        new Date(
            `${task.recurrence.startDate}T00:00:00`
        );


    if (targetDate < startDate) {
        return false;
    }


    if (
        task.recurrence.endDate !== null &&
        date > task.recurrence.endDate
    ) {

        return false;

    }


    if (
        task.recurrence.deletedDates.includes(date)
    ) {

        return false;

    }


    if (
        targetDate.getDay() !==
        task.recurrence.weekday
    ) {

        return false;

    }


    return true;

}


// =================================
// HTML ELEMENTS
// =================================

const taskInput =
    document.querySelector("#taskInput");


const taskList =
    document.querySelector("#taskList");


const todoPanel =
    document.querySelector(".todo-panel");


const timeColumn =
    document.querySelector("#timeColumn");


const weekdayRow =
    document.querySelector("#weekdayRow");


const weekdayHeader =
    document.querySelector("#weekdayHeader");


const weekendColumn =
    document.querySelector("#weekendColumn");


const previousWeek =
    document.querySelector("#previousWeek");


const nextWeek =
    document.querySelector("#nextWeek");


const weekTitle =
    document.querySelector("#weekTitle");


const recurringEditButton =
    document.querySelector(
        "#recurringEditButton"
    );


// =================================
// CSS CONFIGURATION
// =================================

document.documentElement.style.setProperty(
    "--slot-height",
    `${CALENDAR_CONFIG.slotHeight}px`
);


// =================================
// RECURRING EDIT MODE
// =================================

if (recurringEditButton) {

    recurringEditButton.addEventListener(
        "click",
        function() {

            recurringEditMode =
                !recurringEditMode;


            document.body.classList.toggle(
                "recurring-edit-mode",
                recurringEditMode
            );


            recurringEditButton.classList.toggle(
                "active",
                recurringEditMode
            );


            recurringEditButton.textContent =
                recurringEditMode
                    ? "Done editing"
                    : "Edit recurring tasks";


            renderTasks();

        }
    );

}


// =================================
// CREATE NEW TASK
// =================================

taskInput.addEventListener(
    "keydown",
    async function(event) {

        if (event.key !== "Enter") {
            return;
        }


        const taskName =
            taskInput.value.trim();


        if (taskName === "") {
            return;
        }


        // =================================
        // CREATE RECURRING TASK
        // =================================

        if (recurringEditMode) {

            const weekDates =
                getWeekDates(
                    currentWeekStart
                );


            const startDate =
                formatDate(
                    weekDates[0]
                );


            const task =
                createRecurringTask(
                    taskName,
                    startDate
                );


            tasks.push(task);

            taskInput.value = "";

            await saveTasks();

            renderTasks();

            return;

        }


        // =================================
        // CREATE NORMAL TASK
        // =================================

        const task = {

            id: Date.now(),

            name: taskName,

            completed: false,

            date: null,

            startTime: null,

            duration: 30,

            type: "task"

        };


        tasks.push(task);

        taskInput.value = "";

        await saveTasks();

        renderTasks();

    }
);


// =================================
// CREATE TASK ELEMENT
// =================================

function createTaskElement(task) {

    const taskDiv =
        document.createElement("div");


    taskDiv.classList.add("task");


    taskDiv.dataset.taskId =
        task.id;


    // =================================
    // RECURRING TASK CLASS
    // =================================

    if (isRecurringTask(task)) {

        taskDiv.classList.add(
            "recurring-task"
        );

    }


    // =================================
    // DRAGGING
    // =================================

    taskDiv.draggable = true;


    taskDiv.addEventListener(
        "dragstart",
        function(event) {

            if (
                isRecurringTask(task) &&
                !recurringEditMode
            ) {

                event.preventDefault();

                return;

            }


            draggedTask = task;


            draggedTaskOccurrenceDate =
                taskDiv.dataset.occurrenceDate ||
                null;


            const rect =
                taskDiv.getBoundingClientRect();


            dragOffsetY =
                event.clientY -
                rect.top;

        }
    );


    // =================================
    // CHECKBOX
    // =================================

    if (!isRecurringTask(task)) {

        const checkbox =
            document.createElement("input");


        checkbox.type = "checkbox";


        checkbox.checked =
            task.completed;


        checkbox.addEventListener(
            "change",
            async function(event) {

                event.stopPropagation();


                task.completed =
                    checkbox.checked;


                await saveTasks();

                renderTasks();

            }
        );


        taskDiv.appendChild(
            checkbox
        );

    }


    // =================================
    // TASK TEXT
    // =================================

    const text =
        document.createElement("span");


    text.classList.add(
        "task-text"
    );


    text.textContent =
        task.name;


    if (
        task.completed &&
        !isRecurringTask(task)
    ) {

        text.classList.add(
            "completed"
        );

    }


    taskDiv.appendChild(
        text
    );


    // =================================
    // DELETE BUTTON
    // =================================

    const deleteButton =
        document.createElement("button");


    deleteButton.classList.add(
        "delete-task-button"
    );


    deleteButton.innerHTML =
        "X";


    deleteButton.title =
        "Delete task";


    deleteButton.addEventListener(
        "click",
        async function(event) {

            event.preventDefault();

            event.stopPropagation();


            // =================================
            // RECURRING TASK
            // =================================

            if (isRecurringTask(task)) {

                if (!recurringEditMode) {
                    return;
                }


                const occurrenceDate =
                    taskDiv.dataset.occurrenceDate;


                // Unplaced recurring task
                if (!occurrenceDate) {

                    tasks =
                        tasks.filter(
                            function(item) {

                                return item.id !== task.id;

                            }
                        );


                    await deleteTaskFromSupabase(
                        task.id
                    );


                    saveTasks();

                    renderTasks();

                    return;

                }


                showRecurringDeleteMenu(
                    task,
                    occurrenceDate
                );


                return;

            }


            // =================================
            // NORMAL TASK
            // =================================

            tasks =
                tasks.filter(
                    function(item) {

                        return item.id !== task.id;

                    }
                );


            await deleteTaskFromSupabase(
                task.id
            );


            saveTasks();

            renderTasks();

        }
    );


    if (
        !isRecurringTask(task) ||
        recurringEditMode
    ) {

        taskDiv.appendChild(
            deleteButton
        );

    }


    return taskDiv;

}


// =================================
// RECURRING DELETE MENU
// =================================

const recurringDeleteOverlay =
    document.querySelector(
        "#recurringDeleteOverlay"
    );


const recurringDeleteTitle =
    document.querySelector(
        "#recurringDeleteTitle"
    );


const deleteThisInstance =
    document.querySelector(
        "#deleteThisInstance"
    );


const deleteFutureInstances =
    document.querySelector(
        "#deleteFutureInstances"
    );


const cancelRecurringDelete =
    document.querySelector(
        "#cancelRecurringDelete"
    );


let recurringDeleteTask = null;

let recurringDeleteDate = null;


// =================================
// OPEN DELETE MENU
// =================================

function showRecurringDeleteMenu(
    task,
    occurrenceDate
) {

    recurringDeleteTask =
        task;

    recurringDeleteDate =
        occurrenceDate;


    recurringDeleteTitle.textContent =
        `Delete "${task.name}"?`;


    recurringDeleteOverlay.classList.add(
        "visible"
    );

}


// =================================
// CLOSE DELETE MENU
// =================================

function closeRecurringDeleteMenu() {

    recurringDeleteOverlay.classList.remove(
        "visible"
    );


    recurringDeleteTask = null;

    recurringDeleteDate = null;

}


// =================================
// DELETE THIS INSTANCE
// =================================

deleteThisInstance.addEventListener(
    "click",
    async function() {

        if (
            !recurringDeleteTask ||
            !recurringDeleteDate
        ) {

            return;

        }


        const task =
            recurringDeleteTask;


        const date =
            recurringDeleteDate;


        if (
            !task.recurrence.deletedDates.includes(
                date
            )
        ) {

            task.recurrence.deletedDates.push(
                date
            );

        }


        await saveTasks();

        closeRecurringDeleteMenu();

        renderTasks();

    }
);


// =================================
// DELETE THIS + FUTURE
// =================================

deleteFutureInstances.addEventListener(
    "click",
    async function() {

        if (
            !recurringDeleteTask ||
            !recurringDeleteDate
        ) {

            return;

        }


        const task =
            recurringDeleteTask;


        const dateObject =
            new Date(
                `${recurringDeleteDate}T00:00:00`
            );


        dateObject.setDate(
            dateObject.getDate() - 1
        );


        task.recurrence.endDate =
            formatDate(dateObject);


        await saveTasks();

        closeRecurringDeleteMenu();

        renderTasks();

    }
);


// =================================
// CANCEL RECURRING DELETE
// =================================

cancelRecurringDelete.addEventListener(
    "click",
    function() {

        closeRecurringDeleteMenu();

    }
);


// =================================
// CLICK OUTSIDE MENU
// =================================

recurringDeleteOverlay.addEventListener(
    "click",
    function(event) {

        if (
            event.target ===
            recurringDeleteOverlay
        ) {

            closeRecurringDeleteMenu();

        }

    }
);


// =================================
// ESCAPE TO CANCEL
// =================================

document.addEventListener(
    "keydown",
    function(event) {

        if (
            event.key === "Escape" &&
            recurringDeleteOverlay.classList.contains(
                "visible"
            )
        ) {

            closeRecurringDeleteMenu();

        }

    }
);


// =================================
// FORMAT MODAL DATE
// =================================

function formatModalDate(
    dateString
) {

    const date =
        new Date(
            `${dateString}T00:00:00`
        );


    return date.toLocaleDateString(
        "en-US",
        {
            weekday: "long",
            month: "long",
            day: "numeric"
        }
    );

}


// =================================
// RENDER TASKS
// =================================

function renderTasks() {

    taskList.innerHTML = "";


    document
        .querySelectorAll(".calendar-task")
        .forEach(
            function(element) {

                element.remove();

            }
        );


    const weekDates =
        getWeekDates(
            currentWeekStart
        );


    tasks.forEach(
        function(task) {

            // =================================
            // NORMAL TODO TASK
            // =================================

            if (
                !isRecurringTask(task) &&
                task.date === null
            ) {

                taskList.appendChild(
                    createTaskElement(task)
                );

                return;

            }


            // =================================
            // RECURRING TASK
            // =================================

            if (isRecurringTask(task)) {

                // Not yet placed
                if (
                    task.recurrence.weekday === null ||
                    task.startTime === null
                ) {

                    taskList.appendChild(
                        createTaskElement(task)
                    );

                    return;

                }


                // Display occurrences
                weekDates.forEach(
                    function(date) {

                        const dateString =
                            formatDate(date);


                        if (
                            !recurringTaskOccursOnDate(
                                task,
                                dateString
                            )
                        ) {

                            return;

                        }


                        const day =
                            document.querySelector(
                                `[data-date="${dateString}"]`
                            );


                        if (!day) {
                            return;
                        }


                        const taskElement =
                            createTaskElement(task);


                        taskElement.classList.add(
                            "calendar-task",
                            "recurring-task"
                        );


                        taskElement.dataset.occurrenceDate =
                            dateString;


                        taskElement.draggable =
                            recurringEditMode;


                        // =================================
                        // RESIZE
                        // =================================

                        if (
                            recurringEditMode &&
                            day.classList.contains("day")
                        ) {

                            const resizeHandle =
                                document.createElement(
                                    "div"
                                );


                            resizeHandle.classList.add(
                                "task-resize-handle"
                            );


                            taskElement.appendChild(
                                resizeHandle
                            );


                            setupResizeHandle(
                                resizeHandle,
                                task,
                                taskElement
                            );

                        }


                        // =================================
                        // POSITION
                        // =================================

                        if (
                            task.startTime !== null &&
                            day.classList.contains("day")
                        ) {

                            taskElement.style.top =
                                `${getTopPosition(
                                    task.startTime
                                )}px`;


                            taskElement.style.height =
                                `${getTaskHeight(
                                    task.duration
                                )}px`;

                        }


                        day.appendChild(
                            taskElement
                        );

                    }
                );


                return;

            }


            // =================================
            // NORMAL CALENDAR TASK
            // =================================

            const day =
                document.querySelector(
                    `[data-date="${task.date}"]`
                );


            if (!day) {
                return;
            }


            const taskElement =
                createTaskElement(task);


            taskElement.classList.add(
                "calendar-task",
                "regular-task"
            );


            // =================================
            // RESIZE HANDLE
            // =================================

            if (
                day.classList.contains("day")
            ) {

                const resizeHandle =
                    document.createElement(
                        "div"
                    );


                resizeHandle.classList.add(
                    "task-resize-handle"
                );


                taskElement.appendChild(
                    resizeHandle
                );


                setupResizeHandle(
                    resizeHandle,
                    task,
                    taskElement
                );

            }


            // =================================
            // POSITION
            // =================================

            if (
                task.startTime !== null &&
                day.classList.contains("day")
            ) {

                taskElement.style.top =
                    `${getTopPosition(
                        task.startTime
                    )}px`;


                taskElement.style.height =
                    `${getTaskHeight(
                        task.duration
                    )}px`;

            }


            day.appendChild(
                taskElement
            );

        }
    );

}


// =================================
// GET WEEK DATES
// =================================

function getWeekDates(
    startDate
) {

    const dates = [];


    const day =
        new Date(startDate);


    day.setHours(
        0,
        0,
        0,
        0
    );


    const dayNumber =
        day.getDay();


    const difference =
        dayNumber === 0
            ? -6
            : 1 - dayNumber;


    day.setDate(
        day.getDate() + difference
    );


    for (
        let i = 0;
        i < 7;
        i++
    ) {

        const newDate =
            new Date(day);


        newDate.setDate(
            day.getDate() + i
        );


        dates.push(newDate);

    }


    return dates;

}


// =================================
// CHANGE WEEK
// =================================

function changeWeek(
    amount
) {

    currentWeekStart.setDate(
        currentWeekStart.getDate() +
        (
            amount * 7
        )
    );


    renderCalendar();

    renderTasks();

}


// =================================
// WEEK NAVIGATION
// =================================

previousWeek.addEventListener(
    "click",
    function() {

        changeWeek(-1);

    }
);


nextWeek.addEventListener(
    "click",
    function() {

        changeWeek(1);

    }
);


// =================================
// WEEK TITLE
// =================================

function renderWeekTitle() {

    const dates =
        getWeekDates(
            currentWeekStart
        );


    const start =
        dates[0].toLocaleDateString(
            "en-US",
            {
                month: "short",
                day: "numeric"
            }
        );


    const end =
        dates[6].toLocaleDateString(
            "en-US",
            {
                month: "short",
                day: "numeric"
            }
        );


    weekTitle.textContent =
        `${start} – ${end}`;

}


// =================================
// GENERATE TIME SLOTS
// =================================

function generateTimeSlots() {

    const slots = [];


    for (
        let i = 0;
        i < TOTAL_SLOTS;
        i++
    ) {

        const totalMinutes =
            i *
            CALENDAR_CONFIG.minutesPerSlot;


        const hour =
            CALENDAR_CONFIG.startHour +
            Math.floor(
                totalMinutes / 60
            );


        const minute =
            totalMinutes % 60;


        slots.push({

            hour: hour,

            minute: minute,

            value:
                `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,

            isHour:
                minute === 0

        });

    }


    return slots;

}


// =================================
// RENDER TIME COLUMN
// =================================

function renderTimeColumn() {

    timeColumn.innerHTML = "";


    generateTimeSlots()
        .forEach(
            function(slot) {

                const element =
                    document.createElement(
                        "div"
                    );


                element.classList.add(
                    "time-slot"
                );


                if (slot.isHour) {

                    element.textContent =
                        String(slot.hour)
                            .padStart(2, "0");

                }


                timeColumn.appendChild(
                    element
                );

            }
        );

}


// =================================
// CREATE TIME GRID
// =================================

function createTimeGrid() {

    weekdayRow
        .querySelectorAll(".time-grid")
        .forEach(
            function(grid) {

                grid.remove();

            }
        );


    const days =
        weekdayRow.querySelectorAll(
            ".day"
        );


    days.forEach(
        function(day) {

            const grid =
                document.createElement(
                    "div"
                );


            grid.classList.add(
                "time-grid"
            );


            generateTimeSlots()
                .forEach(
                    function(slot) {

                        const element =
                            document.createElement(
                                "div"
                            );


                        element.classList.add(
                            "grid-slot"
                        );


                        if (slot.isHour) {

                            element.classList.add(
                                "hour-line"
                            );

                        }


                        grid.appendChild(
                            element
                        );

                    }
                );


            day.appendChild(
                grid
            );

        }
    );

}


// =================================
// GET TASK TOP POSITION
// =================================

function getTopPosition(
    startTime
) {

    const [hour, minute] =
        startTime
            .split(":")
            .map(Number);


    const minutesFromStart =
        (
            hour * 60 +
            minute
        ) -
        (
            CALENDAR_CONFIG.startHour * 60
        );


    const slotsFromStart =
        minutesFromStart /
        CALENDAR_CONFIG.minutesPerSlot;


    return (
        slotsFromStart *
        CALENDAR_CONFIG.slotHeight
    );

}


// =================================
// GET TASK HEIGHT
// =================================

function getTaskHeight(
    duration
) {

    const slots =
        duration /
        CALENDAR_CONFIG.minutesPerSlot;


    return (
        slots *
        CALENDAR_CONFIG.slotHeight
    );

}


// =================================
// GET TIME FROM DROP POSITION
// =================================

function getTimeFromPosition(
    day,
    mouseY
) {

    const rect =
        day.getBoundingClientRect();


    const taskTop =
        mouseY -
        dragOffsetY;


    const position =
        taskTop -
        rect.top;


    const rawSlot =
        position /
        CALENDAR_CONFIG.slotHeight;


    const slotIndex =
        Math.round(rawSlot);


    let totalMinutes =
        (
            CALENDAR_CONFIG.startHour * 60
        ) +
        (
            slotIndex *
            CALENDAR_CONFIG.minutesPerSlot
        );


    const minimumMinutes =
        CALENDAR_CONFIG.startHour * 60;


    const maximumMinutes =
        (
            CALENDAR_CONFIG.endHour * 60
        ) -
        CALENDAR_CONFIG.minutesPerSlot;


    totalMinutes =
        Math.max(
            minimumMinutes,
            Math.min(
                maximumMinutes,
                totalMinutes
            )
        );


    const hour =
        Math.floor(
            totalMinutes / 60
        );


    const minute =
        totalMinutes % 60;


    return (
        `${String(hour).padStart(2, "0")}:` +
        `${String(minute).padStart(2, "0")}`
    );

}


// =================================
// CREATE DAY ELEMENT
// =================================

function createDayElement(
    date,
    isWeekend
) {

    const day =
        document.createElement("div");


    day.classList.add(
        isWeekend
            ? "weekend-day"
            : "day"
    );


    day.dataset.date =
        formatDate(date);


    if (isWeekend) {

        const title =
            document.createElement("h3");


        title.textContent =
            formatHeaderDate(date);


        day.appendChild(title);

    }


    return day;

}


// =================================
// DATE FORMATTING
// =================================

function formatDate(
    date
) {

    return date
        .toISOString()
        .split("T")[0];

}


function formatHeaderDate(
    date
) {

    return date.toLocaleDateString(
        "en-US",
        {
            weekday: "short",
            month: "short",
            day: "numeric"
        }
    );

}


// =================================
// CLEAR DROP HIGHLIGHTS
// =================================

function clearDropHover() {

    document
        .querySelectorAll(".drop-hover")
        .forEach(
            function(element) {

                element.classList.remove(
                    "drop-hover"
                );

            }
        );

}


// =================================
// RENDER CALENDAR
// =================================

function renderCalendar() {

    renderWeekTitle();

    weekdayHeader.innerHTML = "";

    weekdayRow.innerHTML = "";

    weekendColumn.innerHTML = "";


    const dates =
        getWeekDates(
            currentWeekStart
        );


    dates.forEach(
        function(date, index) {

            // =================================
            // MONDAY - FRIDAY
            // =================================

            if (
                index <
                CALENDAR_CONFIG.weekdays
            ) {

                const header =
                    document.createElement(
                        "div"
                    );


                header.classList.add(
                    "weekday-header-day"
                );


                header.textContent =
                    formatHeaderDate(date);


                weekdayHeader.appendChild(
                    header
                );


                weekdayRow.appendChild(
                    createDayElement(
                        date,
                        false
                    )
                );


                return;

            }


            // =================================
            // SATURDAY - SUNDAY
            // =================================

            weekendColumn.appendChild(
                createDayElement(
                    date,
                    true
                )
            );

        }
    );


    createTimeGrid();

    setupDropZones();

}


// =================================
// DRAG AND DROP
// =================================

function setupDropZones() {

    const days =
        document.querySelectorAll(
            "[data-date]"
        );


    days.forEach(
        function(day) {

            // =================================
            // DRAG OVER
            // =================================

            day.addEventListener(
                "dragover",
                function(event) {

                    if (
                        draggedTask &&
                        isRecurringTask(draggedTask) &&
                        !recurringEditMode
                    ) {

                        return;

                    }


                    event.preventDefault();


                    clearDropHover();


                    day.classList.add(
                        "drop-hover"
                    );

                }
            );


            // =================================
            // DROP
            // =================================

            day.addEventListener(
                "drop",
                async function(event) {

                    event.preventDefault();


                    if (!draggedTask) {
                        return;
                    }


                    // =================================
                    // RECURRING TASK
                    // =================================

                    if (
                        isRecurringTask(
                            draggedTask
                        )
                    ) {

                        if (!recurringEditMode) {
                            return;
                        }


                        const droppedDate =
                            day.dataset.date;


                        const droppedDateObject =
                            new Date(
                                `${droppedDate}T00:00:00`
                            );


                        draggedTask.recurrence.weekday =
                            droppedDateObject.getDay();


                        if (
                            day.classList.contains("day")
                        ) {

                            draggedTask.startTime =
                                getTimeFromPosition(
                                    day,
                                    event.clientY
                                );

                        } else {

                            draggedTask.startTime =
                                null;

                        }


                        clearDropHover();


                        await saveTasks();


                        renderCalendar();

                        renderTasks();

                        return;

                    }


                    // =================================
                    // NORMAL TASK
                    // =================================

                    draggedTask.date =
                        day.dataset.date;


                    if (
                        day.classList.contains("day")
                    ) {

                        draggedTask.startTime =
                            getTimeFromPosition(
                                day,
                                event.clientY
                            );

                    } else {

                        draggedTask.startTime =
                            null;

                    }


                    clearDropHover();


                    await saveTasks();


                    renderTasks();

                }
            );

        }
    );

}


// =================================
// RETURN TASK TO TODO LIST
// =================================

todoPanel.addEventListener(
    "dragover",
    function(event) {

        if (
            draggedTask &&
            isRecurringTask(draggedTask)
        ) {

            return;

        }


        event.preventDefault();


        clearDropHover();


        todoPanel.classList.add(
            "drop-hover"
        );

    }
);


todoPanel.addEventListener(
    "drop",
    async function(event) {

        event.preventDefault();


        if (!draggedTask) {
            return;
        }


        if (
            isRecurringTask(draggedTask)
        ) {

            return;

        }


        draggedTask.date =
            null;


        draggedTask.startTime =
            null;


        draggedTask.duration =
            30;


        clearDropHover();


        await saveTasks();


        renderTasks();

    }
);


// =================================
// RESIZE HANDLE
// =================================

function setupResizeHandle(
    handle,
    task,
    taskElement
) {

    handle.addEventListener(
        "mousedown",
        function(event) {

            event.preventDefault();

            event.stopPropagation();


            if (
                isRecurringTask(task) &&
                !recurringEditMode
            ) {

                return;

            }


            resizingTask =
                task;


            resizingElement =
                taskElement;


            resizeStartY =
                event.clientY;


            resizeStartHeight =
                taskElement.offsetHeight;


            document.body.style.cursor =
                "ns-resize";

        }
    );

}


// =================================
// RESIZE — MOUSE MOVE
// =================================

document.addEventListener(
    "mousemove",
    function(event) {

        if (
            !resizingTask ||
            !resizingElement
        ) {

            return;

        }


        const deltaY =
            event.clientY -
            resizeStartY;


        const rawHeight =
            resizeStartHeight +
            deltaY;


        const slotHeight =
            CALENDAR_CONFIG.slotHeight;


        const slots =
            Math.round(
                rawHeight /
                slotHeight
            );


        const minimumSlots =
            1;


        const finalSlots =
            Math.max(
                minimumSlots,
                slots
            );


        const finalHeight =
            finalSlots *
            slotHeight;


        resizingElement.style.height =
            `${finalHeight}px`;

    }
);


// =================================
// RESIZE — MOUSE UP
// =================================

document.addEventListener(
    "mouseup",
    async function() {

        if (
            !resizingTask ||
            !resizingElement
        ) {

            return;

        }


        const height =
            resizingElement.offsetHeight;


        const slots =
            Math.round(
                height /
                CALENDAR_CONFIG.slotHeight
            );


        resizingTask.duration =
            slots *
            CALENDAR_CONFIG.minutesPerSlot;


        await saveTasks();


        resizingTask =
            null;


        resizingElement =
            null;


        document.body.style.cursor =
            "";

    }
);


// =================================
// DRAG END
// =================================

document.addEventListener(
    "dragend",
    function() {

        draggedTask =
            null;


        draggedTaskOccurrenceDate =
            null;


        dragOffsetY =
            0;


        clearDropHover();

    }
);


// =================================
// LOAD TASKS FROM SUPABASE
// =================================

async function loadTasksFromSupabase() {

    const {
        data,
        error
    } = await supabaseClient
        .from("tasks")
        .select("*")
        .order(
            "id",
            {
                ascending: true
            }
        );


    if (error) {

        console.error(
            "Failed to load tasks from Supabase:",
            error
        );

        return false;

    }


    tasks =
        data.map(
            function(task) {

                return {

                    id:
                        task.id,

                    name:
                        task.name,

                    completed:
                        task.completed,

                    date:
                        task.date,

                    startTime:
                        task.start_time,

                    duration:
                        task.duration,

                    type:
                        task.type,

                    recurrence:
                        task.recurrence

                };

            }
        );


    // Keep localStorage synchronized
    // with the database.
    localStorage.setItem(
        "plannerTasks",
        JSON.stringify(tasks)
    );


    console.log(
        "Tasks loaded from Supabase:",
        tasks
    );


    return true;

}


// =================================
// SHOW LOGIN
// =================================

function showLogin() {

    document
        .querySelector("#authScreen")
        .style.display = "flex";

}


// =================================
// HIDE LOGIN
// =================================

function hideLogin() {

    document
        .querySelector("#authScreen")
        .style.display = "none";

}


// =================================
// LOGIN
// =================================

async function login() {

    const email =
        document
            .querySelector("#emailInput")
            .value
            .trim();


    const password =
        document
            .querySelector("#passwordInput")
            .value;


    const message =
        document.querySelector(
            "#authMessage"
        );


    message.textContent =
        "Logging in...";


    const {
        data,
        error
    } =
        await supabaseClient.auth.signInWithPassword({

            email:
                email,

            password:
                password

        });


    if (error) {

        console.error(
            "Login error:",
            error
        );


        message.textContent =
            error.message;


        return;

    }


    console.log(
        "Logged in:",
        data.user
    );


    const loaded =
        await loadTasksFromSupabase();


    if (!loaded) {

        message.textContent =
            "Could not load your tasks.";

        return;

    }


    hideLogin();


    renderTimeColumn();

    renderCalendar();

    renderTasks();

}


// =================================
// LOGIN BUTTON
// =================================

document
    .querySelector("#loginButton")
    .addEventListener(
        "click",
        login
    );


// =================================
// SUPABASE AUTH STATE
// =================================

supabaseClient.auth.onAuthStateChange(
    function(event, session) {

        console.log(
            "Auth event:",
            event
        );

    }
);


// =================================
// INITIALIZE PLANNER
// =================================

async function startPlanner() {

    const {
        data: { session },
        error
    } =
        await supabaseClient.auth.getSession();


    if (error) {

        console.error(
            "Session error:",
            error
        );


        showLogin();

        return;

    }


    // =================================
    // NOT LOGGED IN
    // =================================

    if (!session) {

        showLogin();

        return;

    }


    // =================================
    // EXISTING SESSION
    // =================================

    console.log(
        "Existing session found:",
        session.user
    );


    const loaded =
        await loadTasksFromSupabase();


    if (!loaded) {

        console.error(
            "Could not load tasks."
        );


        return;

    }


    hideLogin();


    renderTimeColumn();

    renderCalendar();

    renderTasks();

}


startPlanner();